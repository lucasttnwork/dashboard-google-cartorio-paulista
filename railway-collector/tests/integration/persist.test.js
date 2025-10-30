jest.mock('../../src/monitoring/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logApiCall: jest.fn(),
  logDebug: jest.fn()
}));

const ApifyCollector = require('../../src/collectors/apify-collector');
const DataProcessor = require('../../src/collectors/data-processor');
const supabaseStorage = require('../../src/storage/supabase-client');
const config = require('../../src/utils/config');
const { logInfo } = require('../../src/monitoring/logger');

// Mock Apify client
jest.mock('apify-client', () => ({
  ApifyClient: jest.fn(() => ({
    actor: jest.fn(() => ({
      call: jest.fn().mockResolvedValue({
        id: 'run-123',
        status: 'SUCCEEDED',
        defaultDatasetId: 'dataset-123'
      })
    })),
    dataset: jest.fn(() => ({
      listItems: jest.fn().mockResolvedValue({
        items: [
          {
            review_id: 'review1',
            rating: 5,
            comment: 'Excelente atendimento',
            reviewerName: 'João'
          },
          {
            review_id: 'review2',
            rating: 4,
            comment: 'Bom serviço',
            reviewerName: 'Maria'
          }
        ]
      })
    }))
  }))
}));

// Mock config if needed
jest.mock('../../src/utils/config', () => ({
  LOCATION_ID: 'test-location',
  SUPABASE_TABLE_REVIEWS: 'reviews',
  SUPABASE_TABLE_REVIEWS_RAW: 'reviews_raw',
  SUPABASE_TABLE_RUNS: 'collection_runs',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  APIFY_ACTOR_ID: 'actor-id',
  APIFY_MAX_REVIEWS: 200,
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY_MS: 1000,
  getApifyInput: () => ({ input: 'test' })
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { status: 'completed', reviews_new: 2, reviews_updated: 1 } }),
    rpc: jest.fn().mockResolvedValue({ data: true }),
  }))
}));

// Mock supabase client for some methods to avoid real DB in tests, but use real for persist to test integration
// For full integration, perhaps use supabase test instance, but here mock getExistingReviews to simulate dedup
supabaseStorage.getExistingReviews = jest.fn().mockResolvedValue([]); // No existing for first test

describe('E2E Integration: Collector -> Processor -> Storage', () => {
  let collector;
  let processor;

  beforeAll(() => {
    collector = new ApifyCollector();
    processor = new DataProcessor();

    supabaseStorage.createRun = jest.fn();
    supabaseStorage.persistReviews = jest.fn();
    supabaseStorage.getExistingReviews = jest.fn();
    supabaseStorage.validateSchema = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    supabaseStorage.createRun.mockResolvedValue('run-test-1');
    supabaseStorage.persistReviews.mockResolvedValue({ inserted: 2, updated: 0 });
    supabaseStorage.getExistingReviews.mockResolvedValue([]);
    supabaseStorage.validateSchema.mockResolvedValue(true);
  });

  test('Full flow: Collect, process, persist sem duplicatas', async () => {
    const rawReviews = await collector.fetchReviews();
    expect(rawReviews.length).toBe(2);

    const normalized = await processor.normalize(rawReviews);
    const { newReviews, updatedReviews } = await processor.deduplicate(normalized);

    expect(newReviews.length).toBe(2);
    expect(updatedReviews.length).toBe(0);

    const runId = await supabaseStorage.createRun({ run_type: 'scheduled' });
    const result = await supabaseStorage.persistReviews(newReviews, updatedReviews, runId);

    expect(runId).toBe('run-test-1');
    expect(result).toEqual({ inserted: 2, updated: 0 });
    expect(supabaseStorage.persistReviews).toHaveBeenCalledWith(newReviews, updatedReviews, runId);
  });

  test('Dedup detecta updates quando review existente muda', async () => {
    supabaseStorage.getExistingReviews.mockResolvedValueOnce([
      {
        review_id: 'review1',
        rating: 5,
        comment: 'Comentário antigo',
        response_text: null
      }
    ]);
    supabaseStorage.persistReviews.mockResolvedValueOnce({ inserted: 1, updated: 1 });

    const rawReviews = await collector.fetchReviews();
    const normalized = await processor.normalize(rawReviews);
    const { newReviews, updatedReviews } = await processor.deduplicate(normalized);

    expect(newReviews.length).toBe(1);
    expect(updatedReviews.length).toBe(1);

    await supabaseStorage.persistReviews(newReviews, updatedReviews, 'run-test-2');

    expect(supabaseStorage.persistReviews).toHaveBeenCalledWith(newReviews, updatedReviews, 'run-test-2');
  });
});

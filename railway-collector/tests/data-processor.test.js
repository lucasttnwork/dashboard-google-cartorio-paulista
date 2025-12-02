const DataProcessor = require('../src/collectors/data-processor');

jest.mock('../src/storage/supabase-client', () => ({
  getExistingReviews: jest.fn()
}));

jest.mock('../src/utils/apify-normalizer', () => ({
  normalizeApifyReviews: jest.fn()
}));

jest.mock('../src/monitoring/logger', () => ({
  logInfo: jest.fn()
}));

const mockStorage = require('../src/storage/supabase-client');
const { normalizeApifyReviews } = require('../src/utils/apify-normalizer');
const { logInfo } = require('../src/monitoring/logger');

describe('DataProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new DataProcessor();
    jest.clearAllMocks();
  });

  test('should normalize valid reviews', async () => {
    const rawReviews = [
      { review_id: '1', rating: 5, comment: 'Good', reviewer_name: 'User' }
    ];
    const normalized = [
      { review_id: '1', rating: 5, comment: 'Good', reviewer_name: 'User' }
    ];

    normalizeApifyReviews.mockReturnValue(normalized);
    mockStorage.getExistingReviews.mockResolvedValue([]);

    const result = await processor.normalize(rawReviews);

    expect(normalizeApifyReviews).toHaveBeenCalledWith(rawReviews, expect.any(String));
    expect(logInfo).toHaveBeenCalledWith('Starting data normalization', { count: rawReviews.length });
    expect(logInfo).toHaveBeenCalledWith('Normalization completed', expect.any(Object));
    expect(result).toEqual(normalized);
  });

  test('should filter invalid reviews during normalization', async () => {
    const rawReviews = [
      { review_id: '1', rating: 5, comment: 'Good', reviewer_name: 'User' },
      { review_id: '2' } // Invalid: missing fields
    ];
    const normalized = [
      { review_id: '1', rating: 5, comment: 'Good', reviewer_name: 'User' },
      { review_id: '2' }
    ];

    normalizeApifyReviews.mockReturnValue(normalized);

    const result = await processor.normalize(rawReviews);

    expect(normalizeApifyReviews).toHaveBeenCalledWith(rawReviews, expect.any(String));
    expect(logInfo).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].review_id).toBe('1');
  });

  test('should deduplicate reviews correctly', async () => {
    const normalizedReviews = [
      { review_id: '1', rating: 5, comment: 'Good', reviewer_name: 'User', response_text: null },
      { review_id: '2', rating: 4, comment: 'Ok', reviewer_name: 'User2', response_text: null }
    ];
    const existingReviews = [
      { review_id: '1', rating: 5, comment: 'Good', reviewer_name: 'User', response_text: null }
    ];

    mockStorage.getExistingReviews.mockResolvedValue(existingReviews);

    const result = await processor.deduplicate(normalizedReviews);

    expect(mockStorage.getExistingReviews).toHaveBeenCalledWith(['1', '2']);
    expect(logInfo).toHaveBeenCalledWith('Deduplication completed', expect.any(Object));
    expect(result.newReviews).toHaveLength(1);
    expect(result.newReviews[0].review_id).toBe('2');
    expect(result.updatedReviews).toHaveLength(0);
  });

  test('should detect changes for updates', async () => {
    const normalizedReviews = [
      { 
        review_id: '1', 
        rating: 5, 
        comment: 'Updated comment', 
        reviewer_name: 'User',
        response_text: 'New response'
      }
    ];
    const existingReviews = [
      { 
        review_id: '1', 
        rating: 5, 
        comment: 'Old comment', 
        reviewer_name: 'User',
        response_text: null
      }
    ];

    mockStorage.getExistingReviews.mockResolvedValue(existingReviews);

    const result = await processor.deduplicate(normalizedReviews);

    expect(mockStorage.getExistingReviews).toHaveBeenCalledWith(['1']);
    expect(logInfo).toHaveBeenCalledWith('Deduplication completed', expect.any(Object));
    expect(result.updatedReviews).toHaveLength(1);
    expect(result.newReviews).toHaveLength(0);
  });
});

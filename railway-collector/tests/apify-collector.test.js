const ApifyCollector = require('../src/collectors/apify-collector');
const { ApifyClient } = require('apify-client');

jest.mock('apify-client');
jest.mock('../src/monitoring/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn()
}));

jest.mock('../src/utils/config', () => ({
  APIFY_ACTOR_ID: 'test-actor',
  getApifyInput: () => ({}),
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5000,
  APIFY_MAX_REVIEWS: 200
}));

const { logInfo, logWarning } = require('../src/monitoring/logger');
const config = require('../src/utils/config');

describe('ApifyCollector', () => {
  let collector;
  let mockActor;
  let mockDataset;

  beforeEach(() => {
    jest.useFakeTimers();
    collector = new ApifyCollector();
    mockActor = { call: jest.fn() };
    mockDataset = { listItems: jest.fn() };
    jest.spyOn(collector.client, 'actor').mockReturnValue(mockActor);
    jest.spyOn(collector.client, 'dataset').mockReturnValue(mockDataset);
    jest.spyOn(collector, 'delay').mockImplementation(() => Promise.resolve()); // Immediate for tests
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should fetch reviews successfully', async () => {
    const mockRun = { id: 'run-id', status: 'SUCCEEDED', defaultDatasetId: 'dataset123' };
    const mockItems = { items: [{ id: 'review1' }] };
    
    mockActor.call.mockResolvedValue(mockRun);
    mockDataset.listItems.mockResolvedValue(mockItems);

    const result = await collector.fetchReviews();

    expect(collector.client.actor).toHaveBeenCalledWith(config.APIFY_ACTOR_ID);
    expect(mockActor.call).toHaveBeenCalledWith(config.getApifyInput());
    expect(collector.client.dataset).toHaveBeenCalledWith('dataset123');
    expect(mockDataset.listItems).toHaveBeenCalledWith({ limit: 200 });
    expect(logInfo).toHaveBeenCalledWith('Starting Apify collection', config.getApifyInput());
    expect(logInfo).toHaveBeenCalledWith('Apify collection completed', { reviewsFound: 1, runId: 'run-id' });
    expect(result).toEqual(mockItems.items);
  }, 10000);

  test('should retry on failure and succeed on second attempt', async () => {
    const mockRunFail = { status: 'FAILED' };
    const mockRunSuccess = { id: 'run-id', status: 'SUCCEEDED', defaultDatasetId: 'dataset123' };
    const mockItems = { items: [{ id: 'review2' }] };
    
    mockActor.call
      .mockResolvedValueOnce(mockRunFail)
      .mockResolvedValueOnce(mockRunSuccess);
    mockDataset.listItems.mockResolvedValue(mockItems);

    const result = await collector.fetchReviews();

    expect(mockActor.call).toHaveBeenCalledTimes(2);
    expect(logWarning).toHaveBeenCalledWith('Apify collection failed, retrying', { attempt: 1, error: expect.any(String) });
    expect(logInfo).toHaveBeenCalledWith('Apify collection completed', { reviewsFound: 1, runId: 'run-id' });
    expect(result).toEqual(mockItems.items);
  }, 10000);

  test('should throw error after max retries', async () => {
    const mockError = new Error('API Error');
    
    mockActor.call.mockRejectedValue(mockError);

    await expect(collector.fetchReviews()).rejects.toThrow('API Error');
    expect(mockActor.call).toHaveBeenCalledTimes(config.RETRY_ATTEMPTS + 1);
    expect(logWarning).toHaveBeenCalledTimes(config.RETRY_ATTEMPTS);
  }, 10000);
});

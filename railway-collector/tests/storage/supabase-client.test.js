const storage = require('../../src/storage/supabase-client');
const { logInfo, logError, logApiCall } = require('../../src/monitoring/logger');

jest.mock('../../src/monitoring/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logApiCall: jest.fn(),
  logDebug: jest.fn()
}));

jest.mock('../../src/utils/config', () => ({
  LOCATION_ID: 'test-location',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
}));

describe('SupabaseStorage.persistReviews', () => {
  let originalClient;

  beforeEach(() => {
    originalClient = storage.client;
    storage.client = {
      rpc: jest.fn()
    };
    jest.spyOn(storage, 'validateSchema').mockResolvedValue(true);
    jest.clearAllMocks();
  });

  afterEach(() => {
    storage.client = originalClient;
    storage.validateSchema.mockRestore();
  });

  test('should call RPC with new and updated reviews and return result', async () => {
    const newReviews = [{ review_id: '1', raw_payload: { foo: 'bar' } }];
    const updatedReviews = [{ review_id: '2', raw_payload: { baz: 'qux' } }];
    const rpcResult = { inserted: 1, updated: 1, raw_upserted: 2 };

    storage.client.rpc.mockResolvedValue({ data: rpcResult, error: null });

    const result = await storage.persistReviews(newReviews, updatedReviews, 10);

    expect(storage.validateSchema).toHaveBeenCalledTimes(1);
    expect(storage.client.rpc).toHaveBeenCalledWith('persist_reviews_atomic', {
      p_new_reviews: newReviews,
      p_updated_reviews: updatedReviews,
      p_location_id: 'test-location',
      p_run_id: 10
    });
    expect(result).toEqual(rpcResult);
    expect(logApiCall).toHaveBeenCalledWith(
      'supabase',
      'persist_reviews_atomic',
      expect.any(Number),
      expect.objectContaining({ inserted: 1, updated: 1, run_id: 10 })
    );
    expect(logInfo).toHaveBeenCalledWith('Atomic review persistence completed', rpcResult);
  });

  test('should throw when RPC returns error object', async () => {
    const rpcError = { message: 'RPC boom' };

    storage.client.rpc.mockResolvedValue({ data: null, error: rpcError });

    await expect(storage.persistReviews([], [], 11)).rejects.toThrow('RPC failed: RPC boom');
    expect(logError).toHaveBeenCalledWith(
      'Failed to persist reviews atomically',
      expect.objectContaining({ message: 'RPC failed: RPC boom' })
    );
  });
});

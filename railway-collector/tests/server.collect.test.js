process.env.NODE_ENV = "test";

const request = require("supertest");

jest.mock("../src/monitoring/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logApiCall: jest.fn(),
  logDebug: jest.fn(),
}));

jest.mock("../src/storage/supabase-client", () => ({
  testConnection: jest.fn(),
  createRun: jest.fn(),
  persistReviews: jest.fn(),
  finalizeRun: jest.fn(),
  updateLocationMetrics: jest.fn(),
}));

jest.mock("../src/collectors/apify-collector");
jest.mock("../src/collectors/data-processor");

const App = require("../server");
const storage = require("../src/storage/supabase-client");
const ApifyCollector = require("../src/collectors/apify-collector");
const DataProcessor = require("../src/collectors/data-processor");

describe("POST /collect", () => {
  const mockFetchReviews = jest.fn();
  const mockNormalize = jest.fn();
  const mockDeduplicate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    ApifyCollector.mockImplementation(() => ({
      fetchReviews: mockFetchReviews,
    }));

    DataProcessor.mockImplementation(() => ({
      normalize: mockNormalize,
      deduplicate: mockDeduplicate,
    }));

    storage.testConnection.mockResolvedValue(true);
    storage.createRun.mockResolvedValue("run-1");
    storage.persistReviews.mockResolvedValue({ inserted: 2, updated: 1 });
    storage.updateLocationMetrics.mockResolvedValue(undefined);
    storage.finalizeRun.mockResolvedValue(undefined);

    mockFetchReviews.mockResolvedValue([
      { id: "review-1" },
      { id: "review-2" },
    ]);
    mockNormalize.mockResolvedValue([
      { review_id: "review-1" },
      { review_id: "review-2" },
    ]);
    mockDeduplicate.mockResolvedValue({
      newReviews: [{ review_id: "review-1" }],
      updatedReviews: [{ review_id: "review-2" }],
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test("should execute collection pipeline and return 200 with summary", async () => {
    const response = await request(App)
      .post("/collect")
      .send({ source: "test-suite" })
      .expect(200);

    expect(storage.testConnection).toHaveBeenCalledTimes(1);
    expect(storage.createRun).toHaveBeenCalledWith({
      run_type: "manual",
      source: "test-suite",
      metadata: expect.objectContaining({ source: "test-suite" }),
    });
    expect(mockFetchReviews).toHaveBeenCalledTimes(1);
    expect(mockNormalize).toHaveBeenCalledTimes(1);
    expect(mockDeduplicate).toHaveBeenCalledTimes(1);
    expect(storage.persistReviews).toHaveBeenCalledWith(
      [{ review_id: "review-1" }],
      [{ review_id: "review-2" }],
      "run-1",
    );
    expect(storage.updateLocationMetrics).toHaveBeenCalledTimes(1);
    expect(storage.finalizeRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: "completed",
        reviews_new: 2,
        reviews_updated: 1,
      }),
    );

    expect(response.body).toMatchObject({
      message: "Manual collection completed",
      run_id: "run-1",
      reviews_found: 2,
      reviews_new: 2,
      reviews_updated: 1,
      normalized_reviews: 2,
    });
  });

  test("should finalize run with failed status when pipeline throws", async () => {
    mockFetchReviews.mockRejectedValueOnce(new Error("Apify failure"));

    const response = await request(App)
      .post("/collect")
      .send({ source: "test-error" })
      .expect(500);

    expect(storage.finalizeRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: "failed",
        error_message: "Apify failure",
      }),
    );

    expect(response.body).toMatchObject({
      error: "Apify failure",
      run_id: "run-1",
    });
  });

  test("should return 500 when Supabase connection fails before creating run", async () => {
    storage.testConnection.mockResolvedValueOnce(false);

    const response = await request(App)
      .post("/collect")
      .send({ source: "connection-error" })
      .expect(500);

    expect(storage.createRun).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      error: "Supabase connection failed",
    });
  });
});

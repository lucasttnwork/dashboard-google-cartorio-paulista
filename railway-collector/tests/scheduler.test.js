process.env.NODE_ENV = "test";

jest.mock("node-cron", () => ({
  schedule: jest.fn(),
}));

jest.mock("@supabase/node-fetch", () => jest.fn(() => Promise.resolve({
  ok: true,
  status: 200,
  json: jest.fn().mockResolvedValue({ message: "ok" }),
})));

jest.mock("../src/monitoring/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("../src/utils/config", () => ({
  CRON_SCHEDULE: "0 6 * * *",
  TIMEZONE: "America/Sao_Paulo",
}));

const fetch = require("@supabase/node-fetch");
const cron = require("node-cron");
const { logInfo, logError } = require("../src/monitoring/logger");

describe("Scheduler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.COLLECTOR_SERVICE_URL = "https://example.com";
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ message: "ok" }),
    });
  });

  afterEach(() => {
    delete process.env.COLLECTOR_SERVICE_URL;
  });

  test("startScheduler throws when COLLECTOR_SERVICE_URL missing", () => {
    delete process.env.COLLECTOR_SERVICE_URL;
    const { startScheduler } = require("../src/scheduler");

    expect(() => startScheduler()).toThrow("COLLECTOR_SERVICE_URL not set");
    expect(logError).toHaveBeenCalled();
  });

  test("startScheduler schedules cron when url present", () => {
    jest.isolateModules(() => {
      const { startScheduler } = require("../src/scheduler");

      startScheduler();

      expect(logInfo).toHaveBeenCalledWith(
        "Starting Railway cron scheduler",
        expect.objectContaining({ collector_url: "https://example.com" }),
      );
      expect(cron.schedule).toHaveBeenCalledTimes(1);
    });
  });

  test("triggerCollection hits collector endpoint", async () => {
    jest.isolateModules(async () => {
      const { triggerCollection } = require("../src/scheduler");

      const result = await triggerCollection();

      expect(fetch).toHaveBeenCalledWith("https://example.com/collect", expect.any(Object));
      expect(result).toEqual({ message: "ok" });
    });
  });

  test("triggerCollection logs error when fetch fails", async () => {
    jest.isolateModules(async () => {
      fetch.mockRejectedValueOnce(new Error("network"));
      const { triggerCollection } = require("../src/scheduler");

      await expect(triggerCollection()).rejects.toThrow("network");
      expect(logError).toHaveBeenCalledWith("Scheduled collection failed", expect.any(Error));
    });
  });
});


const cron = require("node-cron");
const fetch = require("@supabase/node-fetch");
const { logInfo, logError } = require("../monitoring/logger");
const config = require("../utils/config");

function getCollectorUrl() {
  return process.env.COLLECTOR_SERVICE_URL;
}

async function triggerCollection() {
  const startTime = Date.now();

  try {
    const collectorUrl = getCollectorUrl();
    if (!collectorUrl) {
      throw new Error("COLLECTOR_SERVICE_URL not set");
    }

    const response = await fetch(`${collectorUrl}/collect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Collector-Trigger": "railway-cron",
      },
      body: JSON.stringify({
        source: "railway_cron",
        scheduled_at: new Date().toISOString(),
      }),
    });

    const elapsed = Date.now() - startTime;
    const data = await response.json().catch(() => null);

    logInfo("Scheduled collection executed", {
      status: response.status,
      duration_ms: elapsed,
      result: data,
    });

    if (!response.ok) {
      throw new Error(
        `Collector endpoint returned ${response.status}: ${JSON.stringify(data)}`,
      );
    }

    return data;
  } catch (error) {
    logError("Scheduled collection failed", error);
    throw error;
  }
}

function startScheduler() {
  const collectorUrl = getCollectorUrl();
  if (!collectorUrl) {
    logError("Collector service URL missing", new Error("COLLECTOR_SERVICE_URL not set"));
    throw new Error("COLLECTOR_SERVICE_URL not set");
  }

  logInfo("Starting Railway cron scheduler", {
    cron_schedule: config.CRON_SCHEDULE,
    timezone: config.TIMEZONE,
    collector_url: collectorUrl,
  });

  cron.schedule(
    config.CRON_SCHEDULE,
    async () => {
      await triggerCollection();
    },
    {
      timezone: config.TIMEZONE,
    },
  );
}

module.exports = {
  startScheduler,
  triggerCollection,
  getCollectorUrl,
};


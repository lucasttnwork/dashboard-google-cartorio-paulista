import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getServiceClient, upsertReview, enqueueForNlp } from "./db.ts";
import { listReviews, normalizeGbpReview } from "./google.ts";

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") ?? undefined;
  const locationId = url.searchParams.get("locationId") ?? undefined;
  const maxPages = Number(url.searchParams.get("maxPages") ?? "5");

  if (!accountId || !locationId) {
    return new Response("Missing accountId or locationId", { status: 400 });
  }

  const client = getServiceClient();

  try {
    let pageToken: string | undefined;
    let pages = 0;
    let processed = 0;
    do {
      const { reviews, nextPageToken } = await listReviews({ accountId, locationId, pageToken, pageSize: 50, orderBy: "updateTime desc" });
      for (const r of reviews) {
        const nr = normalizeGbpReview(r);
        await upsertReview(client, nr);
        await enqueueForNlp(client, nr.review_id);
        processed++;
      }
      pageToken = nextPageToken;
      pages++;
    } while (pageToken && pages < maxPages);

    return new Response(JSON.stringify({ processed }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("gbp-backfill error", e);
    return new Response("Internal Error", { status: 500 });
  }
});



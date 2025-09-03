import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getServiceClient, upsertReview, enqueueForNlp } from "./db.ts";
import { getReviewByName, normalizeGbpReview } from "./google.ts";

type PubSubMessage = {
  message?: { data?: string; attributes?: Record<string, string> };
  subscription?: string;
};

function decodeBase64Json(b64: string): any {
  try {
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Optional simple auth via shared secret for MVP
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret) {
    const hdr = req.headers.get("x-webhook-secret");
    if (hdr !== secret) return new Response("Unauthorized", { status: 401 });
  }

  const client = getServiceClient();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Pub/Sub push envelope
  let event: any = body;
  if (body?.message?.data) {
    const decoded = decodeBase64Json(body.message.data);
    if (decoded) event = decoded;
  }

  // GBP notification may contain the full resource name
  const name: string | undefined = event?.name || event?.resourceName || event?.review?.name;
  if (!name) {
    // Accept test calls without event data
    return new Response("No review name in event", { status: 202 });
  }

  try {
    const raw = await getReviewByName(name.startsWith("/") ? name : `/${name}`);
    const nr = normalizeGbpReview(raw);
    await upsertReview(client, nr);
    await enqueueForNlp(client, nr.review_id);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("gbp-webhook error", e);
    return new Response("Internal Error", { status: 500 });
  }
});



import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getServiceClient } from "./db.ts";

async function postToSlack(webhookUrl: string, message: string) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
  if (!res.ok) throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
}

serve(async () => {
  const client = getServiceClient();
  const slackWebhook = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!slackWebhook) return new Response("Missing SLACK_WEBHOOK_URL", { status: 500 });

  // Find reviews needing alert: rating <= 2 or negative sentiment, not alerted yet
  const { data, error } = await client
    .from("reviews")
    .select("review_id, rating, comment, create_time, review_labels!inner(sentiment)")
    .lte("rating", 2)
    .limit(10);
  if (error) return new Response(error.message, { status: 500 });

  // Also include labeled negatives even if rating is null/3
  const { data: negData, error: negErr } = await client
    .from("review_labels")
    .select("review_id")
    .eq("sentiment", "neg")
    .limit(20);
  if (negErr) return new Response(negErr.message, { status: 500 });

  const negativeIds = new Set((negData ?? []).map((r: any) => r.review_id));
  for (const r of data ?? []) negativeIds.add(r.review_id);

  // Filter out already alerted
  const ids = Array.from(negativeIds);
  if (ids.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const { data: alerted, error: alErr } = await client
    .from("review_alerts")
    .select("review_id")
    .in("review_id", ids)
    .eq("alert_type", "low_rating");
  if (alErr) return new Response(alErr.message, { status: 500 });
  const already = new Set((alerted ?? []).map((a: any) => a.review_id));
  const toSend = ids.filter((id) => !already.has(id));

  let sent = 0;
  for (const id of toSend) {
    // fetch details
    const { data: rev, error: rErr } = await client
      .from("reviews")
      .select("review_id, rating, comment, create_time, location_id")
      .eq("review_id", id)
      .single();
    if (rErr) continue;

    const url = `https://business.google.com/reviews`; // optional: build deep link
    const text = `🔴 Review negativa (${rev.rating}★) em ${rev.create_time}\n${rev.comment ?? "(sem texto)"}\n${url}`;
    try {
      await postToSlack(slackWebhook, text);
      await client.from("review_alerts").insert({ review_id: id, alert_type: "low_rating", channel: "slack", payload: { url } as any });
      sent++;
    } catch (_) {
      // ignore failures to keep scheduler resilient
    }
  }

  return new Response(JSON.stringify({ sent }), { status: 200, headers: { "Content-Type": "application/json" } });
});



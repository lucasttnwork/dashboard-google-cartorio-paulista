import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getServiceClient } from "./db.ts";

type QueueClaim = { id: number; review_id: string; attempts: number };

const WORKER_ID = crypto.randomUUID();

async function claimOne(client: ReturnType<typeof getServiceClient>): Promise<QueueClaim | null> {
  const { data, error } = await client.rpc("claim_nlp_review", { p_worker_id: WORKER_ID });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const row = data[0] as any;
  return { id: Number(row.id), review_id: String(row.review_id), attempts: Number(row.attempts ?? 0) };
}

async function complete(client: ReturnType<typeof getServiceClient>, reviewId: string) {
  const { error } = await client.rpc("complete_nlp_review", { p_review_id: reviewId });
  if (error) throw error;
}

async function fail(client: ReturnType<typeof getServiceClient>, reviewId: string, err: string) {
  const { error } = await client.rpc("fail_nlp_review", { p_review_id: reviewId, p_error: err });
  if (error) throw error;
}

async function fetchReview(client: ReturnType<typeof getServiceClient>, reviewId: string) {
  const { data, error } = await client.from("reviews").select("review_id, comment, rating").eq("review_id", reviewId).single();
  if (error) throw error;
  return data as { review_id: string; comment: string | null; rating: number | null };
}

function detectEnotariadoTerms(text: string): { is_enotariado: boolean; serviceHits: string[] } {
  const synonyms = [
    "e-notariado","enotariado","e notariado","e-notarial",
    "assinatura digital","certificado digital","videoconferência","videoconferencia",
    "icp-brasil","icp brasil","token","a1","a3","escritura digital",
    "procuração eletrônica","procuracao eletronica","reconhecimento por videoconferência"
  ];
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const hits = synonyms.filter(s => normalized.includes(s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()));
  return { is_enotariado: hits.length > 0, serviceHits: hits };
}

function deriveSentiment(rating: number | null, comment: string | null): { sentiment: 'pos'|'neu'|'neg'|'unknown' } {
  if (!rating) return { sentiment: 'unknown' };
  if (rating >= 4) return { sentiment: 'pos' };
  if (rating === 3) return { sentiment: 'neu' };
  return { sentiment: 'neg' };
}

async function upsertLabels(client: ReturnType<typeof getServiceClient>, reviewId: string, labels: {
  sentiment: 'pos'|'neu'|'neg'|'unknown';
  is_enotariado: boolean;
}) {
  const { error } = await client.from("review_labels").upsert({
    review_id: reviewId,
    sentiment: labels.sentiment,
    is_enotariado: labels.is_enotariado,
    classifier_version: "v1-rules",
  });
  if (error) throw error;
}

async function upsertServiceLinks(client: ReturnType<typeof getServiceClient>, reviewId: string, hits: string[]) {
  if (hits.length === 0) return;
  // find service id for e-notariado
  const { data: svc, error: svcErr } = await client.from("services").select("id").eq("name", "e-notariado").single();
  if (svcErr) throw svcErr;
  const serviceId = svc.id as number;
  const rows = hits.map(() => ({ review_id: reviewId, service_id: serviceId, confidence: 0.9 }));
  const { error } = await client.from("review_services").upsert(rows, { onConflict: "review_id,service_id" });
  if (error) throw error;
}

serve(async () => {
  const client = getServiceClient();
  try {
    const job = await claimOne(client);
    if (!job) {
      return new Response(JSON.stringify({ claimed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const r = await fetchReview(client, job.review_id);
    const { is_enotariado, serviceHits } = detectEnotariadoTerms(r.comment ?? "");
    const { sentiment } = deriveSentiment(r.rating, r.comment);
    await upsertLabels(client, r.review_id, { sentiment, is_enotariado });
    await upsertServiceLinks(client, r.review_id, is_enotariado ? serviceHits : []);
    await complete(client, r.review_id);
    return new Response(JSON.stringify({ claimed: true, review_id: r.review_id, sentiment, is_enotariado }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("classifier error", e);
    // Best effort to record failure if we had reviewId in scope; skip if not available
    return new Response("Internal Error", { status: 500 });
  }
});



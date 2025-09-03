import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.2";

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type NormalizedReview = {
  review_id: string;
  location_id: string;
  rating: number | null;
  comment: string | null;
  reviewer_name: string | null;
  is_anonymous: boolean | null;
  create_time: string | null;
  update_time: string | null;
  reply_text: string | null;
  reply_time: string | null;
  raw_payload: unknown;
};

export async function upsertReview(client: SupabaseClient, nr: NormalizedReview) {
  const { error: rawErr } = await client
    .from("reviews_raw")
    .upsert({
      review_id: nr.review_id,
      location_id: nr.location_id,
      payload: nr.raw_payload as Record<string, unknown>,
    }, { onConflict: "review_id" });
  if (rawErr) throw rawErr;

  const { error: normErr } = await client
    .from("reviews")
    .upsert({
      review_id: nr.review_id,
      location_id: nr.location_id,
      rating: nr.rating,
      comment: nr.comment,
      reviewer_name: nr.reviewer_name,
      is_anonymous: nr.is_anonymous,
      create_time: nr.create_time,
      update_time: nr.update_time,
      reply_text: nr.reply_text,
      reply_time: nr.reply_time,
    }, { onConflict: "review_id" });
  if (normErr) throw normErr;
}

export async function enqueueForNlp(client: SupabaseClient, reviewId: string) {
  const { error } = await client.rpc("enqueue_nlp_review", { p_review_id: reviewId });
  if (error) throw error;
}



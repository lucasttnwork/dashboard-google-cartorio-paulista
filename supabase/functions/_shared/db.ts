// @ts-nocheck
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.2";

let supabaseOverride: { url?: string; key?: string } | null = null;
export function setSupabaseAuthOverride(params: { url?: string; key?: string } | null) {
  supabaseOverride = params;
}

export function getServiceClient(): SupabaseClient {
  const url = supabaseOverride?.url ?? Deno.env.get("SUPABASE_URL");
  const key = supabaseOverride?.key ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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
  // raw
  const { error: rawErr } = await client
    .from("reviews_raw")
    .upsert({
      review_id: nr.review_id,
      location_id: nr.location_id,
      payload: nr.raw_payload as Record<string, unknown>,
    }, { onConflict: "review_id" });
  if (rawErr) throw rawErr;

  // normalized
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

export async function ensureLocation(client: SupabaseClient, params: {
  location_id: string;
  title?: string | null;
  name?: string | null;
  place_id?: string | null;
  cid?: string | null;
  website?: string | null;
  address?: string | null;
  phone?: string | null;
  domain?: string | null;
}) {
  const payload = {
    location_id: params.location_id,
    title: params.title ?? null,
    name: params.name ?? null,
    place_id: params.place_id ?? null,
    cid: params.cid ?? null,
    website: params.website ?? null,
    address: params.address ?? null,
    phone: params.phone ?? null,
    domain: params.domain ?? (params.website ? new URL(params.website).hostname : null),
  } as Record<string, unknown>;
  const { error } = await client
    .from("gbp_locations")
    .upsert(payload, { onConflict: "location_id" });
  if (error) throw error;
}



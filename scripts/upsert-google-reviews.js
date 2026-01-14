/**
 * Script canônico de ingestão de reviews do Google Business Profile.
 * Usa apenas um arquivo JSON local, aplica deduplicação por review_id
 * e faz upsert nas tabelas `reviews_raw` e `reviews` do Supabase.
 * Execute com: `node scripts/upsert-google-reviews.js path/para/dataset.json`.
 * Use o mesmo padrão para qualquer importação futura.
 */

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_DATASET = path.resolve(
  __dirname,
  "../Raw-data-scraper-runs/dataset_Google-Maps-Reviews-Scraper_2025-12-02_12-40-19-228.json",
);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = Math.max(1, Number(process.env.REVIEW_BATCH_SIZE ?? "250"));
const LOCATION_ID = process.env.GBP_LOCATION_ID ?? "cartorio-paulista-location";
const ACCOUNT_ID = process.env.GBP_ACCOUNT_ID ?? "cartorio-paulista";
const ACCOUNT_NAME = process.env.GBP_ACCOUNT_NAME ?? "Cartório Paulista";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("⌛ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureAccount() {
  const { error } = await supabase
    .from("gbp_accounts")
    .upsert({ account_id: ACCOUNT_ID, display_name: ACCOUNT_NAME }, { onConflict: "account_id" });
  if (error) throw error;
}

let locationId = LOCATION_ID;

async function ensureLocation(sampleReview) {
  if (!sampleReview) return locationId;
  const website = sampleReview.url ?? null;
  let domain = null;
  if (website) {
    try {
      domain = new URL(website).hostname;
    } catch {
      domain = null;
    }
  }

  const placeId = sampleReview.placeId ?? null;
  if (placeId) {
    const { data: existing } = await supabase
      .from("gbp_locations")
      .select("location_id")
      .eq("place_id", placeId)
      .maybeSingle();
    if (existing?.location_id) {
      locationId = existing.location_id;
    }
  }

  const payload = {
    location_id: locationId,
    account_id: ACCOUNT_ID,
    name: sampleReview.title ?? ACCOUNT_NAME,
    title: sampleReview.title ?? ACCOUNT_NAME,
    place_id: placeId,
    cid: sampleReview.cid ?? null,
    website,
    address: sampleReview.address ?? null,
    phone: sampleReview.phone ?? null,
    domain,
  };

  const { error } = await supabase
    .from("gbp_locations")
    .upsert(payload, { onConflict: "location_id" });
  if (error) throw error;
  return locationId;
}

function normalizeReview(review, locationIdOverride) {
  const reviewId = review.reviewId ?? review.review_id ?? review.id;
  if (!reviewId) return null;

  const rating =
    typeof review.stars === "number"
      ? review.stars
      : typeof review.rating === "number"
      ? review.rating
      : null;

  const comment = review.text ?? review.review_text ?? review.comment ?? null;
  const reviewerName = review.name ?? review.reviewer ??
    review.reviewerName ?? review.author ?? null;
  const createTime = review.publishedAtDate ?? review.publishedAt ?? review.scrapedAt ?? null;
  const updateTime = review.responseFromOwnerDate ?? review.reply_updatedAt ??
    review.updatedAtDate ?? review.updateTime ?? createTime;

  const replyText = review.responseFromOwnerText ?? review.replyText ?? null;
  const replyTime = review.responseFromOwnerDate ?? review.replyUpdatedAt ?? null;

  return {
    review_id: reviewId,
    location_id: locationIdOverride,
    rating,
    comment,
    reviewer_name: reviewerName,
    is_anonymous: reviewerName ? false : true,
    create_time: createTime,
    update_time: updateTime,
    reply_text: replyText,
    reply_time: replyTime,
  };
}

async function upsertInBatches(table, records) {
  if (records.length === 0) return;
  const totalBatches = Math.ceil(records.length / BATCH_SIZE);
  for (let i = 0; i < totalBatches; i += 1) {
    const batch = records.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, {
      onConflict: "review_id",
      returning: "minimal",
    });
    if (error) throw error;
    console.log(`✅ [${table}] lote ${i + 1}/${totalBatches} com ${batch.length} registros.`);
  }
}

async function main() {
  const datasetArg = process.argv[2];
  const datasetPath = datasetArg ? path.resolve(process.cwd(), datasetArg) : DEFAULT_DATASET;

  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Arquivo não encontrado: ${datasetPath}`);
  }

  console.log(`📥 Lendo dataset: ${datasetPath}`);
  const raw = fs.readFileSync(datasetPath, "utf-8");
  const reviews = JSON.parse(raw);

  if (!Array.isArray(reviews)) {
    throw new Error("O dataset precisa ser um array de reviews.");
  }

  const uniqueReviews = [];
  const seen = new Set();
  for (const review of reviews) {
    const reviewId = review.reviewId ?? review.review_id ?? review.id;
    if (!reviewId || seen.has(reviewId)) continue;
    seen.add(reviewId);
    uniqueReviews.push(review);
  }

  if (uniqueReviews.length === 0) {
    console.log("⚠️ Nenhum review válido encontrado após deduplicação.");
    return;
  }

  console.log(`🧹 ${uniqueReviews.length} reviews únicos prontos para sincronizar.`);

  await ensureAccount();
  const resolvedLocationId = await ensureLocation(uniqueReviews[0]);

  const rawPayloads = uniqueReviews.map((review) => ({
    review_id: review.reviewId ?? review.review_id ?? review.id,
    location_id: resolvedLocationId,
    payload: review,
  }));

  const normalized = uniqueReviews
    .map((review) => normalizeReview(review, resolvedLocationId))
    .filter(Boolean);

  await upsertInBatches("reviews_raw", rawPayloads);
  await upsertInBatches("reviews", normalized);

  console.log("🎯 Sincronização finalizada. Nenhuma duplicidade foi inserida graças ao upsert e deduplicação local.");
}

main().catch((error) => {
  console.error("❌ Erro durante o upsert:", error);
  process.exit(1);
});


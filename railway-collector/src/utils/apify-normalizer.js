/**
 * Apify Review Normalizer - CommonJS version
 * Ported from TypeScript version in supabase/functions/_shared/apify-normalizer.ts
 */

const SOURCE = "apify";

/**
 * Normalize multiple Apify reviews and deduplicate them
 * @param {Array} reviews - Raw reviews from Apify
 * @param {string} locationId - Location identifier
 * @returns {Array} Normalized and deduplicated reviews
 */
function normalizeApifyReviews(reviews, locationId) {
  const seen = new Set();
  const normalized = [];

  for (const raw of reviews) {
    const mapped = normalizeApifyReview(raw, locationId);
    const dedupeKey = mapped.review_id || mapped.review_url;
    if (!dedupeKey) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(mapped);
  }

  return normalized;
}

/**
 * Normalize a single Apify review
 * @param {Object} raw - Raw review from Apify
 * @param {string} locationId - Location identifier
 * @returns {Object} Normalized review
 */
function normalizeApifyReview(raw, locationId) {
  const reviewId = String(raw.review_id ?? raw.reviewId ?? raw.id ?? generateFallbackId());
  const ratingRaw = raw.rating ?? raw.stars ?? null;
  const responseText = raw.responseText ?? raw.responseFromOwnerText ?? 
    (raw.responseFromOwner && typeof raw.responseFromOwner === 'object' ? raw.responseFromOwner.text : null) ?? null;

  const createTime = coalesceIsoDates(
    raw.publishedAtDate,
    raw.published_at_date,
    raw.publishAtDate,
    raw.publish_at_date,
    raw.publishedAt,
    raw.publishAt,
    raw.createdAt,
    raw.createTime,
    raw.created_time,
    raw.create_time,
  );

  const updateTime = coalesceIsoDates(
    raw.updatedAtDate,
    raw.updated_at_date,
    raw.updatedAt,
    raw.updateAt,
    raw.updateTime,
    raw.updated_time,
    raw.update_time,
    raw.modifiedAt,
    raw.modified_at,
  );

  const responseTime = coalesceIsoDates(
    raw.responseTime,
    raw.response_from_owner_time,
    raw.responseFromOwnerTime,
    raw.responseFromOwnerDate,
    raw.response_from_owner_date,
    (raw.responseFromOwner && typeof raw.responseFromOwner === 'object' ? raw.responseFromOwner.publishedAt : null),
  );

  const lastSeenAt = coalesceIsoDates(
    raw.lastSeenAt,
    raw.last_seen_at,
    raw.scrapedAt,
    raw.scraped_at,
    raw.seenAt,
    raw.seen_at,
  );

  return {
    review_id: reviewId,
    location_id: locationId,
    rating: toNumeric(ratingRaw),
    comment: toNullableString(raw.comment ?? raw.text),
    reviewer_name: toNullableString(raw.name ?? raw.reviewerName),
    reviewer_id: toNullableString(raw.reviewer_id ?? raw.reviewerId),
    reviewer_url: toNullableString(raw.reviewer_url ?? raw.reviewerUrl),
    review_url: toNullableString(raw.review_url ?? raw.reviewUrl),
    is_local_guide: toNullableBoolean(raw.is_local_guide ?? raw.isLocalGuide),
    reviewer_photo_url: toNullableString(raw.reviewerPhotoUrl ?? raw.reviewer_photo_url),
    original_language: toNullableString(raw.originalLanguage ?? raw.original_language),
    translated_text: toNullableString(raw.translatedText ?? raw.textTranslated),
    create_time: createTime,
    update_time: updateTime ?? createTime,
    response_text: toNullableString(responseText),
    response_time: responseTime,
    last_seen_at: lastSeenAt,
    source: SOURCE,
    raw_payload: toPayload(raw),
  };
}

/**
 * Coalesce multiple potential ISO date values
 * @param {...any} values - Values to check for valid dates
 * @returns {string|null} First valid ISO date string or null
 */
function coalesceIsoDates(...values) {
  for (const value of values) {
    const iso = toIsoDate(value);
    if (iso) return iso;
  }
  return null;
}

/**
 * Convert value to ISO date string
 * @param {any} value - Value to convert
 * @returns {string|null} ISO date string or null
 */
function toIsoDate(value) {
  if (value === null || value === undefined) return null;
  
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }
  
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }
  
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return null;
    return new Date(parsed).toISOString();
  }
  
  return null;
}

/**
 * Convert value to numeric or null
 * @param {any} value - Value to convert
 * @returns {number|null} Numeric value or null
 */
function toNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Convert value to nullable string
 * @param {any} value - Value to convert
 * @returns {string|null} String value or null
 */
function toNullableString(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

/**
 * Convert value to nullable boolean
 * @param {any} value - Value to convert
 * @returns {boolean|null} Boolean value or null
 */
function toNullableBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

/**
 * Convert raw object to payload
 * @param {any} raw - Raw object
 * @returns {Object} Payload object
 */
function toPayload(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

/**
 * Generate fallback ID for reviews without proper ID
 * @returns {string} Fallback ID
 */
function generateFallbackId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `apify-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  normalizeApifyReviews,
  normalizeApifyReview,
  // Export testable functions for testing
  __testables: {
    toIsoDate,
    toNumeric,
    toNullableBoolean,
    toNullableString,
    generateFallbackId,
  }
};

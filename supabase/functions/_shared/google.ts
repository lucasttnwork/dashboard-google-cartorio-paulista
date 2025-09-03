import { NormalizedReview } from "./db.ts";

type AccessTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GBP_API_BASE = "https://mybusiness.googleapis.com/v4";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function fetchAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GBP_CLIENT_ID");
  const clientSecret = Deno.env.get("GBP_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GBP_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing GBP_CLIENT_ID/GBP_CLIENT_SECRET/GBP_REFRESH_TOKEN env.");
  }

  // Use cached token if valid for >60s
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain access_token: ${res.status} ${text}`);
  }
  const json = (await res.json()) as AccessTokenResponse;
  const token = json.access_token;
  const expiresAt = Date.now() + (json.expires_in * 1000);
  cachedToken = { token, expiresAt };
  return token;
}

async function gbpFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await fetchAccessToken();
  const res = await fetch(`${GBP_API_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GBP fetch ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function listReviews(params: {
  accountId: string;
  locationId: string;
  pageSize?: number;
  pageToken?: string;
  orderBy?: "updateTime desc" | "updateTime asc";
}): Promise<{ reviews: any[]; nextPageToken?: string }>
{
  const { accountId, locationId, pageSize = 50, pageToken, orderBy = "updateTime desc" } = params;
  const qs = new URLSearchParams({ pageSize: String(pageSize), orderBy });
  if (pageToken) qs.set("pageToken", pageToken);
  const name = `/accounts/${accountId}/locations/${locationId}`;
  const data = await gbpFetch<{ reviews?: any[]; nextPageToken?: string }>(`${name}/reviews?${qs.toString()}`);
  return { reviews: data.reviews ?? [], nextPageToken: data.nextPageToken };
}

export async function getReviewByName(name: string): Promise<any> {
  // name example: /accounts/{aid}/locations/{lid}/reviews/{rid}
  return gbpFetch<any>(`${name.startsWith("/") ? "" : "/"}${name}`);
}

export function normalizeGbpReview(raw: any): NormalizedReview {
  // Attempt to parse IDs from name
  const name: string = raw?.name || ""; // accounts/{aid}/locations/{lid}/reviews/{rid}
  const parts = name.split("/");
  const review_id = raw?.reviewId || parts[parts.length - 1] || crypto.randomUUID();
  const location_id = raw?.locationId || (parts.includes("locations") ? parts[parts.indexOf("locations") + 1] : "");

  // rating: handle numeric or enums like STAR_5
  const ratingRaw = raw?.starRating ?? raw?.rating ?? null;
  let rating: number | null = null;
  if (typeof ratingRaw === "number") rating = ratingRaw;
  else if (typeof ratingRaw === "string") {
    const m = ratingRaw.match(/(\d)/);
    rating = m ? Number(m[1]) : null;
  }

  const comment = raw?.comment ?? null;
  const reviewer_name = raw?.reviewer?.displayName ?? raw?.reviewer?.name ?? raw?.reviewer?.profileName ?? null;
  const is_anonymous = raw?.reviewer?.isAnonymous ?? null;
  const create_time = raw?.createTime ?? raw?.updateTime ?? null;
  const update_time = raw?.updateTime ?? null;
  const reply_text = raw?.reviewReply?.comment ?? raw?.reviewReply?.text ?? null;
  const reply_time = raw?.reviewReply?.updateTime ?? null;

  return {
    review_id,
    location_id,
    rating,
    comment,
    reviewer_name,
    is_anonymous,
    create_time,
    update_time,
    reply_text,
    reply_time,
    raw_payload: raw,
  };
}



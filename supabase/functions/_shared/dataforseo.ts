const DFS_BASE = "https://api.dataforseo.com/v3";

let authOverride: { b64?: string; login?: string; password?: string } | null = null;
export function setDataForSeoAuthOverride(params: { b64?: string; login?: string; password?: string } | null) {
  authOverride = params;
}

function getAuthHeader(): string {
  if (authOverride) {
    if (authOverride.b64 && authOverride.b64.trim().length > 0) {
      return `Basic ${authOverride.b64.trim()}`;
    }
    if (authOverride.login && authOverride.password) {
      return `Basic ${btoa(`${authOverride.login}:${authOverride.password}`)}`;
    }
  }
  const b64 = Deno.env.get("DATAFORSEO_AUTH_B64");
  const login = Deno.env.get("DATAFORSEO_LOGIN");
  const password = Deno.env.get("DATAFORSEO_PASSWORD");
  if (b64 && b64.trim().length > 0) {
    return `Basic ${b64.trim()}`;
  }
  if (login && password) {
    const enc = btoa(`${login}:${password}`);
    return `Basic ${enc}`;
  }
  throw new Error("Missing DATAFORSEO_AUTH_B64 or DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD env.");
}

async function dfsRequest<T = unknown>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${DFS_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": getAuthHeader(),
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ data: [payload] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export type LocalFinderItem = {
  place_id?: string;
  cid?: string | number;
  title?: string;
  rating?: number;
  reviews_count?: number;
  address?: string;
  website?: string;
  phone?: string;
};

type DfsTasksResponse<T> = {
  tasks?: Array<{
    id: string;
    status_code: number;
    status_message: string;
    result?: Array<T>;
  }>;
};

export async function localFinderLiveAdvanced(params: {
  keyword: string;
  location_name?: string; // e.g., "São Paulo, State of São Paulo, Brazil"
  language_code?: string; // e.g., "pt"
  google_domain?: string; // e.g., "google.com.br"
}): Promise<LocalFinderItem[]> {
  const payload: Record<string, unknown> = {
    keyword: params.keyword,
    language_code: params.language_code ?? "pt",
    location_name: params.location_name ?? "São Paulo, State of São Paulo, Brazil",
    google_domain: params.google_domain ?? "google.com.br",
    device: "desktop",
  };
  const json = await dfsRequest<DfsTasksResponse<{ items?: LocalFinderItem[] }>>(
    "/serp/google/local_finder/live/advanced",
    payload,
  );
  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.filter(Boolean);
}

export async function mapsLiveAdvanced(params: {
  keyword: string;
  location_name?: string;
  language_code?: string;
  google_domain?: string;
}): Promise<LocalFinderItem[]> {
  const payload: Record<string, unknown> = {
    keyword: params.keyword,
    language_code: params.language_code ?? "pt",
    location_name: params.location_name ?? "São Paulo, State of São Paulo, Brazil",
    google_domain: params.google_domain ?? "google.com.br",
    device: "desktop",
  };
  const json = await dfsRequest<DfsTasksResponse<{ items?: LocalFinderItem[] }>>(
    "/serp/google/maps/live/advanced",
    payload,
  );
  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.filter(Boolean);
}

export async function businessListingsSearchLive(params: {
  query: string;
  location_name?: string;
  language_code?: string;
  google_domain?: string;
}): Promise<LocalFinderItem[]> {
  const payload: Record<string, unknown> = {
    query: params.query,
    language_code: params.language_code ?? "pt",
    location_name: params.location_name ?? "São Paulo, State of São Paulo, Brazil",
    google_domain: params.google_domain ?? "google.com.br",
    device: "desktop",
  };
  const json = await dfsRequest<DfsTasksResponse<{ items?: LocalFinderItem[] }>>(
    "/business_data/business_listings/search/live/advanced",
    payload,
  );
  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.filter(Boolean);
}

export type ReviewsTaskParams = {
  // at least one among keyword/place_id/cid should be provided
  keyword?: string;
  place_id?: string;
  cid?: string | number;
  sort_by?: string; // e.g., "newest"
  limit?: number; // number of reviews to fetch
};

export async function createReviewsTask(params: ReviewsTaskParams): Promise<{ task_id: string }> {
  if (!params.keyword && !params.place_id && !params.cid) {
    throw new Error("createReviewsTask: provide keyword or place_id or cid");
  }
  const payload: Record<string, unknown> = {
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.place_id ? { place_id: params.place_id } : {}),
    ...(params.cid ? { cid: params.cid } : {}),
    ...(params.sort_by ? { sort_by: params.sort_by } : {}),
    ...(params.limit ? { limit: params.limit } : {}),
    language_code: "pt",
  };
  const json = await dfsRequest<DfsTasksResponse<{ id?: string }>>(
    "/business_data/google/reviews/task_post",
    payload,
  );
  const taskId = json.tasks?.[0]?.id;
  if (!taskId) throw new Error("createReviewsTask: task id not returned");
  return { task_id: taskId };
}

export async function getReviewsTaskResult(taskId: string): Promise<any[]> {
  const url = `${DFS_BASE}/business_data/google/reviews/task_get/${taskId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": getAuthHeader(),
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO task_get failed: ${res.status} ${text}`);
  }
  const json = await res.json() as DfsTasksResponse<{ items?: any[] }>;
  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return items;
}

export async function waitReviewsTaskReady(taskId: string, options?: { attempts?: number; delayMs?: number }): Promise<void> {
  const attempts = options?.attempts ?? 20; // ~ up to 60s with backoff
  const baseDelay = options?.delayMs ?? 1000;
  for (let i = 0; i < attempts; i++) {
    const url = `${DFS_BASE}/business_data/google/reviews/tasks_ready`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Authorization": getAuthHeader(), "Accept": "application/json" },
    });
    if (res.ok) {
      const json = await res.json() as DfsTasksResponse<{ id?: string }>; // tasks list
      const list = json.tasks ?? [];
      const found = list.some((t: any) => t?.id === taskId);
      if (found) return;
    }
    await new Promise((r) => setTimeout(r, baseDelay + i * 500));
  }
}

export function normalizeDfsReview(raw: any, locationId: string) {
  const reviewId = String(
    raw?.review_id ?? raw?.review_id_hash ?? raw?.review_id_value ?? crypto.randomUUID(),
  );
  const ratingRaw = raw?.rating ?? raw?.review_rating ?? null;
  const rating = typeof ratingRaw === "number" ? ratingRaw : (typeof ratingRaw === "string" ? Number(ratingRaw) : null);
  const comment = raw?.review_text ?? raw?.text ?? raw?.comment ?? null;
  const reviewerName = raw?.profile_name ?? raw?.author_name ?? raw?.user_name ?? null;
  const ts = raw?.timestamp ?? raw?.time ?? null; // seconds
  const createdIso = typeof ts === "number" ? new Date(ts * 1000).toISOString() : (raw?.time_parsed ?? null);
  const ownerReply = raw?.owner_response?.text ?? raw?.owner_response_text ?? null;
  const ownerReplyTs = raw?.owner_response?.timestamp ?? raw?.owner_response_time ?? null;
  const replyIso = typeof ownerReplyTs === "number" ? new Date(ownerReplyTs * 1000).toISOString() : null;

  return {
    review_id: reviewId,
    location_id: locationId,
    rating: Number.isFinite(rating) ? rating : null,
    comment: comment,
    reviewer_name: reviewerName,
    is_anonymous: null,
    create_time: createdIso,
    update_time: createdIso,
    reply_text: ownerReply,
    reply_time: replyIso,
    raw_payload: raw,
  };
}



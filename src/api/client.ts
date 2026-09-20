import type { Asset, AssetPage, AssetQuery, BulkResult } from '@/lib/types';

/**
 * A structured API error. Callers branch on `status` and `code`, never on
 * the message text. `retryable` is the single place that decides which
 * failures are transient.
 */
export class ApiError extends Error {
  readonly status: number; // 0 means the request never got a response
  readonly code: string;
  readonly retryAfterMs: number | null;
  readonly requestId: string | null;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    retryAfterMs?: number | null;
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.requestId = init.requestId ?? null;
  }

  /** Transient failures only: network, 429, 503, and the documented safe 500. */
  get retryable(): boolean {
    return (
      this.status === 0 ||
      this.status === 429 ||
      this.status === 503 ||
      this.code === 'write_failed'
    );
  }
}

export const isAbortError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch (err) {
    // An abort is intentional, so it must not look like a failure.
    if (isAbortError(err)) throw err;
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message: 'Could not reach the server.',
    });
  }

  if (!res.ok) {
    let code = 'unknown';
    let message = res.statusText;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      /* response was not JSON */
    }
    throw new ApiError({
      status: res.status,
      code,
      message,
      retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
      requestId: res.headers.get('x-request-id'),
    });
  }
  return res.json() as Promise<T>;
}

/**
 * Canonical form: arrays sorted, so the same filters always produce the same
 * string. The server's cursor fingerprint does not normalise order, so
 * `status=a,b` and `status=b,a` would otherwise trigger a stale_cursor.
 */
export function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  const list = (key: string, values?: string[]) => {
    if (values?.length) params.set(key, [...values].sort().join(','));
  };
  const q = query.q?.trim();
  if (q) params.set('q', q);
  list('status', query.status);
  list('kind', query.kind);
  list('tag', query.tag);
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.owner) params.set('owner', query.owner);
  params.set('sort', query.sort ?? 'updatedAt:desc');
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return params.toString();
}

export function listAssets(query: AssetQuery, signal?: AbortSignal): Promise<AssetPage> {
  return request<AssetPage>(`/api/assets?${toSearchParams(query)}`, { signal });
}

export function getAsset(id: string, signal?: AbortSignal): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, { signal });
}

export function getAssetsByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<{ items: Asset[]; missing: string[] }> {
  // The endpoint rejects more than 25 ids per call. Callers must chunk.
  return request(`/api/assets/batch?ids=${ids.join(',')}`, { signal });
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, 'name' | 'status' | 'tags'>>,
  signal?: AbortSignal,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, patch }),
    signal,
  });
}

export function bulkSetStatus(
  ids: string[],
  status: Asset['status'],
  signal?: AbortSignal,
): Promise<BulkResult> {
  // The endpoint rejects more than 50 ids per call. Callers must chunk.
  return request<BulkResult>('/api/assets/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ ids, status }),
    signal,
  });
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;
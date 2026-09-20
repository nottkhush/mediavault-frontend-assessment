import { ApiError, bulkSetStatus } from '@/api/client';
import { withRetry } from '@/api/retry';
import type { Asset, AssetStatus, BulkResult } from '@/lib/types';

export const CHUNK_SIZE = 50; // the server's hard cap
export const CONCURRENCY = 2;
const MAX_CONFLICT_PASSES = 3;

export interface Failure {
  id: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface BulkOutcome {
  applied: Asset[];
  failed: Failure[];
}

export type BulkState =
  | { phase: 'idle' }
  | { phase: 'running'; status: AssetStatus; done: number; total: number }
  | { phase: 'done'; status: AssetStatus; applied: number; failed: Failure[] };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const jitter = () => Math.random() * 250;

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/** At most `limit` workers pull from a shared queue. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

/** Layer 1: the whole request failed for a transient reason, so resend it. */
const sendChunk = (ids: string[], status: AssetStatus): Promise<BulkResult> =>
  withRetry(() => bulkSetStatus(ids, status));

/** Layer 2: the request worked but some ids hit a random conflict, so resend only those. */
async function processChunk(chunk: string[], status: AssetStatus, out: BulkOutcome) {
  let pending = chunk;
  for (let pass = 0; pass < MAX_CONFLICT_PASSES && pending.length > 0; pass++) {
    if (pass > 0) await sleep(300 * pass + jitter());

    let result: BulkResult;
    try {
      result = await sendChunk(pending, status);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      for (const id of pending) {
        out.failed.push({
          id,
          code: apiError?.code ?? 'unknown',
          message: apiError?.message ?? 'Unexpected error.',
          retryable: apiError?.retryable ?? false,
        });
      }
      return;
    }

    const conflicted: string[] = [];
    for (const r of result.results) {
      if (r.ok) out.applied.push(r.asset);
      else if (r.code === 'conflict') conflicted.push(r.id);
      else out.failed.push({ id: r.id, code: r.code, message: r.message ?? '', retryable: false });
    }
    pending = conflicted;
  }

  // Still conflicting after every pass. Temporary, so the user may try again.
  for (const id of pending) {
    out.failed.push({ id, code: 'conflict', message: 'Write conflict.', retryable: true });
  }
}

export async function runBulkStatus(
  ids: string[],
  status: AssetStatus,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkOutcome> {
  const unique = [...new Set(ids)]; // the server would apply a duplicate twice
  const outcome: BulkOutcome = { applied: [], failed: [] };

  await runPool(chunkIds(unique, CHUNK_SIZE), CONCURRENCY, async (chunk) => {
    await processChunk(chunk, status, outcome);
    onProgress?.(outcome.applied.length + outcome.failed.length, unique.length);
  });

  return outcome;
}
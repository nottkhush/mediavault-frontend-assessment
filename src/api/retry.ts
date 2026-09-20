import { ApiError } from './client';
import { isOffline } from '@/api/online';


export function backoffDelay(attempt: number, err: ApiError, baseMs = 500, capMs = 8000): number {
  const jitter = Math.random() * 250;
  if (err.retryAfterMs) return err.retryAfterMs + jitter; // obey the server
  return Math.min(baseMs * 2 ** attempt, capMs) + jitter;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Retries only what ApiError marks as retryable. 400, 409 and 422 never are,
 * and that decision comes from the status and code, not from message text.
 * With no network there is nothing to retry, so it stops and lets the caller decide.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 4, signal }: { maxAttempts?: number; signal?: AbortSignal } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (
        !(err instanceof ApiError) ||
        !err.retryable ||
        attempt >= maxAttempts - 1 ||
        isOffline()
      ) {
        throw err;
      }
      await sleep(backoffDelay(attempt, err), signal);
    }
  }
}
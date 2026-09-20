import { ApiError } from '@/api/client';

/** Human copy only. Code branches on status and code, never on this text. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "Can't reach the server. Check your connection and try again.";
    if (error.status === 429) return 'Too many requests at once. Give it a few seconds and try again.';
    if (error.status === 503) return 'The library is busy right now. Try again in a moment.';
  }
  return 'Something went wrong while loading assets.';
}

/** Shown small, so a user can quote it to support. */
export const errorReference = (error: unknown): string | null =>
  error instanceof ApiError ? error.requestId : null;
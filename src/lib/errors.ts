import { ApiError } from "@/api/client";

/** Human copy only. Code branches on status and code, never on this text. */
export function describeError(
  error: unknown,
  fallback = "Something went wrong while loading assets.",
): string {
  if (error instanceof ApiError) {
    if (error.code === "legal_hold")
      return "This asset is on legal hold, so it cannot be archived.";
    if (error.code === "write_failed")
      return "We couldn't save that change. Please try again.";
    if (error.status === 0)
      return "Can't reach the server. Check your connection and try again.";
    if (error.status === 429)
      return "Too many requests at once. Give it a few seconds and try again.";
    if (error.status === 503)
      return "The library is busy right now. Try again in a moment.";
  }
  return fallback;
}

/** Shown small, so a user can quote it to support. */
export const errorReference = (error: unknown): string | null =>
  error instanceof ApiError ? error.requestId : null;

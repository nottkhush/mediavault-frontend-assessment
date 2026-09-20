import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

const MAX_RETRIES = 3;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Refetching an infinite query re-requests every loaded page in sequence,
      // which is expensive under an 80 requests per 10s budget.
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        error instanceof ApiError &&
        error.retryable &&
        failureCount < MAX_RETRIES,
      retryDelay: (attempt, error) => {
        const jitter = Math.random() * 250;
        if (error instanceof ApiError && error.retryAfterMs) {
          return error.retryAfterMs + jitter; // obey the server's Retry-After
        }
        return Math.min(500 * 2 ** attempt, 8000) + jitter;
      },
    },
  },
});

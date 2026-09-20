import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';
import { backoffDelay } from './retry';

const MAX_RETRIES = 3; // four attempts in total, the same cap as withRetry

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Refetching an infinite query replays every loaded page, which under an
      // 80 requests per 10s budget would be a self-inflicted outage after every
      // tab switch or reconnect. Paused work still resumes by itself.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: (failureCount, error) =>
        error instanceof ApiError && error.retryable && failureCount < MAX_RETRIES,
      retryDelay: (attempt, error) =>
        error instanceof ApiError ? backoffDelay(attempt, error) : 1000,
    },
  },
});
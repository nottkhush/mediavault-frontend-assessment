import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listAssets, toSearchParams } from '@/api/client';
import type { Asset } from '@/lib/types';
import type { ViewQuery } from './urlState';

// Under the server's cap of 50, and divisible by common column counts.
export const PAGE_SIZE = 48;

export function useAssets(view: ViewQuery) {
  // Canonical string, without the cursor. Same view, same key, every time.
  const key = toSearchParams({ ...view, limit: PAGE_SIZE });

  const query = useInfiniteQuery({
    queryKey: ['assets', key],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listAssets({ ...view, limit: PAGE_SIZE, cursor: pageParam ?? undefined }, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Pagination is offset-based on the server, so rows can shift between pages
  // when data changes. De-duplicating by id keeps React keys unique.
  const items = useMemo(() => {
    const byId = new Map<string, Asset>();
    for (const page of query.data?.pages ?? []) {
      for (const asset of page.items) byId.set(asset.id, asset);
    }
    return [...byId.values()];
  }, [query.data]);

  const pages = query.data?.pages ?? [];
  const total = pages[pages.length - 1]?.total ?? 0;

  // A failed next-page fetch retries the next page. Anything else refetches from the top.
  const retry = () => (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch());

  return {
    items,
    total,
    isPending: query.isPending,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    failureCount: query.failureCount,
    retry,
  };
}
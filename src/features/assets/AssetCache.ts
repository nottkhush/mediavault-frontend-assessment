import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Asset, AssetPage, AssetStatus } from '@/lib/types';

type Pages = InfiniteData<AssetPage, string | null>;

/**
 * Replaces assets in every cached list that contains them, in one cache update.
 * Never replaces a row with an older version, so a late update or a rollback
 * can't overwrite something newer. Untouched pages keep their identity.
 */
export function patchAssetsInCache(queryClient: QueryClient, assets: readonly Asset[]) {
  if (assets.length === 0) return;
  const byId = new Map(assets.map((a) => [a.id, a] as const));

  queryClient.setQueriesData<Pages>({ queryKey: ['assets'] }, (data) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      let items: Asset[] | null = null;
      for (let i = 0; i < page.items.length; i++) {
        const existing = page.items[i];
        const next = existing ? byId.get(existing.id) : undefined;
        if (!existing || !next || existing.version > next.version) continue;
        if (!items) items = page.items.slice();
        items[i] = next;
      }
      if (!items) return page;
      changed = true;
      return { ...page, items };
    });
    return changed ? { ...data, pages } : data;
  });
}

export function patchAssetInCache(queryClient: QueryClient, asset: Asset) {
  patchAssetsInCache(queryClient, [asset]);
}

/**
 * Optimistic flip. Changes only status, keeps the version, and returns the
 * original assets so a failure can be rolled back exactly.
 */
export function applyOptimisticStatus(
  queryClient: QueryClient,
  ids: ReadonlySet<string>,
  status: AssetStatus,
): Map<string, Asset> {
  const previous = new Map<string, Asset>();

  queryClient.setQueriesData<Pages>({ queryKey: ['assets'] }, (data) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      let items: Asset[] | null = null;
      for (let i = 0; i < page.items.length; i++) {
        const existing = page.items[i];
        if (!existing || !ids.has(existing.id) || existing.status === status) continue;
        if (!previous.has(existing.id)) previous.set(existing.id, existing);
        if (!items) items = page.items.slice();
        items[i] = { ...existing, status };
      }
      if (!items) return page;
      changed = true;
      return { ...page, items };
    });
    return changed ? { ...data, pages } : data;
  });

  return previous;
}
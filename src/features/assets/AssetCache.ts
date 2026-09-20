import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Asset, AssetPage } from '@/lib/types';

type Pages = InfiniteData<AssetPage, string | null>;

/**
 * Replaces one asset in every cached list that contains it. Never replaces a
 * row with an older version, so a late or duplicate update can't go backwards.
 * Untouched pages keep their identity, so React skips them.
 */
export function patchAssetInCache(queryClient: QueryClient, asset: Asset) {
  queryClient.setQueriesData<Pages>({ queryKey: ['assets'] }, (data) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      const index = page.items.findIndex((a) => a.id === asset.id);
      const existing = page.items[index];
      if (!existing || existing.version > asset.version) return page;
      changed = true;
      const items = page.items.slice();
      items[index] = asset;
      return { ...page, items };
    });
    return changed ? { ...data, pages } : data;
  });
}
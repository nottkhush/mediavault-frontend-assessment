import { bulkSetStatus } from '@/api/client';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { GridEmpty, GridError, GridSkeleton } from '@/features/assets/GridStates';
import { useAssets } from '@/features/assets/useAssets';
import { useSearchDraft } from '@/features/assets/useSearchDraft';
import { useViewQuery } from '@/features/assets/urlState';
import { describeError } from '@/lib/errors';
import { statusLabel } from '@/lib/format';
import type { Asset, AssetStatus, AssetQuery } from '@/lib/types';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { patchAssetInCache } from '@/features/assets/AssetCache';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'sizeBytes:desc', label: 'Largest first' },
  { value: 'createdAt:desc', label: 'Newest' },
];

export function App() {
  const [view, updateView] = useViewQuery();
  const { status, sort } = view;
  const [searchText, setSearchText] = useSearchDraft(view.q, (next) =>
    updateView({ q: next }, 'replace'),
  );
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    items,
    total,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    failureCount,
    retry,
  } = useAssets(view);

  const toggleSelect = useCallback((id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, []);

  function clearFilters() {
    updateView({ q: '', status: [], kind: [], tag: [], collectionId: '', owner: '' });
  }

  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setNotice(null);
    try {
      // Sends every selected id in one call, which the API refuses above 50.
      const result = await bulkSetStatus(ids, next);
      for (const r of result.results) {
  if (r.ok) patchAssetInCache(queryClient, r.asset);
}
queryClient.invalidateQueries({ queryKey: ['assets'], refetchType: 'none' });
      setNotice(`${result.applied} updated, ${result.failed} failed.`);
      setSelectedIds(new Set());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Bulk update failed');
    }
  }

  function handleSaved(asset: Asset) {
  patchAssetInCache(queryClient, asset);
  // Other cached views may now be wrong (a filter may no longer match this row).
  // Mark them stale without refetching, so they refresh when next opened.
  queryClient.invalidateQueries({ queryKey: ['assets'], refetchType: 'none' });
}

  return (
    <div className="app">
      <header className="topbar">
        <h1>MediaVault</h1>
        <input
          className="search"
          type="search"
          placeholder="Search assets"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select
          value={sort}
          onChange={(e) => updateView({ sort: e.target.value as typeof sort })}
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>

      <div className="filters">
        {STATUSES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={status.includes(s)}
              onChange={(e) =>
                updateView({
                  status: e.target.checked ? [...status, s] : status.filter((x) => x !== s),
                })
              }
            />
            {statusLabel(s)}
          </label>
        ))}
        <span className="muted">
          {isPending
            ? 'Loading…'
            : error && items.length === 0
              ? ''
              : `${items.length} of ${total.toLocaleString()} shown`}
        </span>
        
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size} selected</span>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>
      )}

      {notice && <p className="notice">{notice}</p>}
      {error && items.length > 0 && (
        <p className="error error--banner" role="alert">
          {describeError(error)}
          <button onClick={retry}>Try again</button>
        </p>
      )}

      <main className="content">
        {isPending ? (
          <GridSkeleton retrying={failureCount > 0} />
        ) : error && items.length === 0 ? (
          <GridError error={error} onRetry={retry} />
        ) : items.length === 0 ? (
          <GridEmpty q={view.q} onClear={clearFilters} />
        ) : (
          <AssetGrid
  assets={items}
  selectedIds={selectedIds}
  activeId={activeId}
  onToggleSelect={toggleSelect}
  onOpen={setActiveId}
  hasMore={hasNextPage}
  loadingMore={isFetchingNextPage}
  loadFailed={Boolean(error)}
  onLoadMore={fetchNextPage}
/>
        )}
        {activeId && (
          <AssetDetail id={activeId} onClose={() => setActiveId(null)} onSaved={handleSaved} />
        )}
      </main>
    </div>
  );
}
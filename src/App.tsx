import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import {
  applyOptimisticStatus,
  patchAssetsInCache,
} from '@/features/assets/assetCache';
import { runBulkStatus } from '@/features/assets/bulk';
import type { BulkOutcome, BulkState } from '@/features/assets/bulk';
import { BulkNotice } from '@/features/assets/BulkNotice';
import { GridEmpty, GridError, GridSkeleton } from '@/features/assets/GridStates';
import { useAssets } from '@/features/assets/useAssets';
import { useSearchDraft } from '@/features/assets/useSearchDraft';
import { toUrlSearch, useViewQuery } from '@/features/assets/urlState';
import { describeError } from '@/lib/errors';
import { statusLabel } from '@/lib/format';
import type { Asset, AssetStatus, AssetQuery } from '@/lib/types';
import { isOffline, useOnline } from '@/api/online';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A-Z' },
  { value: 'sizeBytes:desc', label: 'Largest first' },
  { value: 'createdAt:desc', label: 'Newest' },
];

export function App() {
  const queryClient = useQueryClient();
    const online = useOnline();
  const [view, updateView] = useViewQuery();
  const { status, sort } = view;
  const [searchText, setSearchText] = useSearchDraft(view.q, (next) =>
    updateView({ q: next }, 'replace'),
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkState>({ phase: 'idle' });
  const bulkRunning = bulk.phase === 'running';

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

  // The bulk bar must never act on rows the user can no longer see.
  const viewKey = toUrlSearch(view);
  useEffect(() => {
    setSelectedIds((prev) => (prev.size > 0 ? new Set() : prev));
  }, [viewKey]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function selectAllLoaded() {
    setSelectedIds(new Set(items.map((a) => a.id)));
  }

  function clearFilters() {
    updateView({ q: '', status: [], kind: [], tag: [], collectionId: '', owner: '' });
  }

  
  async function runBulk(ids: string[], target: AssetStatus, appliedBefore = 0) {
        // No network: don't flip cards we'd only have to flip back, and don't fire requests.
    if (isOffline()) {
      setBulk({
        phase: 'done',
        status: target,
        applied: appliedBefore,
        failed: ids.map((id) => ({
          id,
          code: 'offline',
          message: 'You are offline.',
          retryable: true,
        })),
      });
      return;
    }
    // 1. Optimistic: flip the cards now and remember the originals.
    const previous = applyOptimisticStatus(queryClient, new Set(ids), target);
    setBulk({ phase: 'running', status: target, done: 0, total: ids.length });

    // 2. Send. runBulkStatus reports per-id failures as data and does not throw
    //    on API errors, but a bug must never leave the UI stuck.
    let outcome: BulkOutcome;
    try {
      outcome = await runBulkStatus(ids, target, (done, all) =>
        setBulk({ phase: 'running', status: target, done, total: all }),
      );
    } catch {
      outcome = {
        applied: [],
        failed: ids.map((id) => ({
          id,
          code: 'unknown',
          message: 'Unexpected error.',
          retryable: true,
        })),
      };
    }

    // 3. Reconcile: server copies for successes, exact rollback for failures.
    patchAssetsInCache(queryClient, outcome.applied);
    const rollback = outcome.failed
      .map((f) => previous.get(f.id))
      .filter((a): a is Asset => a !== undefined);
    patchAssetsInCache(queryClient, rollback);
    queryClient.invalidateQueries({ queryKey: ['assets'], refetchType: 'none' });

    // 4. Successful ids leave the selection. Failed ones stay selected.
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const asset of outcome.applied) next.delete(asset.id);
      return next;
    });
    setBulk({
      phase: 'done',
      status: target,
      applied: appliedBefore + outcome.applied.length,
      failed: outcome.failed,
    });
  }

  function applyBulkStatus(target: AssetStatus) {
    if (selectedIds.size === 0 || bulkRunning) return;
    void runBulk([...selectedIds], target);
  }

  function retryFailed() {
    if (bulk.phase !== 'done' || bulkRunning) return;
    const ids = bulk.failed.filter((f) => f.retryable).map((f) => f.id);
    if (ids.length > 0) void runBulk(ids, bulk.status, bulk.applied);
  }


  return (
    <div className="app">
      <ConnectionBanner />
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
              : `${items.length.toLocaleString()} of ${total.toLocaleString()} shown`}
        </span>
        {items.length > 0 && (
          <button onClick={selectAllLoaded}>Select loaded ({items.length.toLocaleString()})</button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size.toLocaleString()} selected</span>
          {STATUSES.map((s) => (
            <button key={s} disabled={bulkRunning} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button disabled={bulkRunning} onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <BulkNotice
        state={bulk}
        onRetry={retryFailed}
        onDismiss={() => setBulk({ phase: 'idle' })}
      />
      {error && items.length > 0 && (
        <p className="error error--banner" role="alert">
          {describeError(error)}
          <button onClick={retry}>Try again</button>
        </p>
      )}

           <main className="content">
        <ErrorBoundary label="the asset list" resetKey={viewKey}>
          {isPending ? (
            <GridSkeleton retrying={failureCount > 0} offline={!online} />
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
        </ErrorBoundary>
        {activeId && (
          <ErrorBoundary key={activeId} label="this asset" className="panel">
            <AssetDetail id={activeId} onClose={() => setActiveId(null)} />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
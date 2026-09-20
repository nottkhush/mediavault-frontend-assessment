import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isOffline, useOnline } from '@/api/online';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LiveRegion } from '@/components/LiveRegion';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { applyOptimisticStatus, patchAssetsInCache } from '@/features/assets/assetCache';
import { runBulkStatus } from '@/features/assets/bulk';
import type { BulkOutcome, BulkState } from '@/features/assets/bulk';
import { BulkNotice, describeBulk } from '@/features/assets/BulkNotice';
import { focusAssetCell, useFocusRescue } from '@/features/assets/focus';
import type { SelectMode } from '@/features/assets/gridLayout';
import { GridEmpty, GridError, GridSkeleton } from '@/features/assets/GridStates';
import { useAssets } from '@/features/assets/useAssets';
import { useSearchDraft } from '@/features/assets/useSearchDraft';
import { toUrlSearch, useViewQuery } from '@/features/assets/urlState';
import { describeError } from '@/lib/errors';
import { statusLabel } from '@/lib/format';
import type { Asset, AssetStatus, AssetQuery } from '@/lib/types';

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
  useFocusRescue();

  const [view, updateView] = useViewQuery();
  const { status, sort } = view;
  const [searchText, setSearchText] = useSearchDraft(view.q, (next) =>
    updateView({ q: next }, 'replace'),
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [restoreFor, setRestoreFor] = useState<string | null>(null);
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

  // Refs so the selection callback stays stable and cards can stay memoised.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const anchorRef = useRef<string | null>(null);
  const rangeBaseRef = useRef<Set<string> | null>(null);

  function resetRange() {
    anchorRef.current = null;
    rangeBaseRef.current = null;
  }

  // The bulk bar must never act on rows the user can no longer see.
  const viewKey = toUrlSearch(view);
  useEffect(() => {
    resetRange();
    setSelectedIds((prev) => (prev.size > 0 ? new Set() : prev));
  }, [viewKey]);

  /**
   * toggle: plain click or Space. Flips one card and sets the anchor.
   * anchor: a plain arrow key. Moves the anchor without changing the selection.
   * extend: shift-click or Shift+arrow. The range between the anchor and this card
   *         replaces the previous range, on top of what was selected before it started.
   */
  const select = useCallback((id: string, mode: SelectMode, fromId?: string) => {
    if (mode === 'anchor') {
      anchorRef.current = id;
      rangeBaseRef.current = null;
      return;
    }
    if (mode === 'toggle') {
      anchorRef.current = id;
      rangeBaseRef.current = null;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    if (!anchorRef.current) anchorRef.current = fromId ?? id;
    if (!rangeBaseRef.current) rangeBaseRef.current = new Set(selectedRef.current);
    const list = itemsRef.current;
    const a = list.findIndex((x) => x.id === anchorRef.current);
    const b = list.findIndex((x) => x.id === id);
    if (a === -1 || b === -1) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const next = new Set(rangeBaseRef.current);
    for (let i = lo; i <= hi; i++) {
      const asset = list[i];
      if (asset) next.add(asset.id);
    }
    setSelectedIds(next);
  }, []);

  function selectAllLoaded() {
    resetRange();
    setSelectedIds(new Set(items.map((a) => a.id)));
  }

  function clearSelection() {
    resetRange();
    setSelectedIds(new Set());
  }

  function clearFilters() {
    updateView({ q: '', status: [], kind: [], tag: [], collectionId: '', owner: '' });
  }

  const closeDetail = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    setActiveId(null);
    setRestoreFor(id);
  }, []);

  // Closing the panel returns focus to the card that was open, or to a sensible fallback.
  useEffect(() => {
    if (!restoreFor || activeId !== null) return;
    focusAssetCell(restoreFor);
    setRestoreFor(null);
  }, [restoreFor, activeId]);

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
    resetRange();
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

  // One announcement per settled result, never per keystroke or per scrolled page.
  const resultText =
    isPending || (error && items.length === 0)
      ? ''
      : `${total.toLocaleString()} ${total === 1 ? 'asset' : 'assets'} found${
          view.q ? ` for “${view.q}”` : ''
        }`;

  return (
    <div className="app">
      <ConnectionBanner />
      <LiveRegion message={resultText} />
      <LiveRegion message={describeBulk(bulk)} />

      <header className="topbar">
        <h1>MediaVault</h1>
        <input
          className="search"
          type="search"
          placeholder="Search assets"
          aria-label="Search assets"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select
          aria-label="Sort by"
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
        <div className="filters__group" role="group" aria-label="Filter by status">
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
        </div>
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
        <div className="bulkbar" role="group" aria-label="Bulk actions">
          <span>{selectedIds.size.toLocaleString()} selected</span>
          {STATUSES.map((s) => (
            <button key={s} disabled={bulkRunning} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button disabled={bulkRunning} onClick={clearSelection}>
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

      <main
        className="content"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && activeId && !e.defaultPrevented) {
            e.preventDefault();
            closeDetail();
          }
        }}
      >
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
              total={total}
              selectedIds={selectedIds}
              activeId={activeId}
              onSelect={select}
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
            <AssetDetail id={activeId} onClose={closeDetail} />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
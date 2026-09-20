import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
import type { Asset } from '@/lib/types';
import { AssetCard } from './AssetCard';
import { computeLayout, FOOTER_H, GAP, OVERSCAN, PAD, PREFETCH_ROWS } from './gridLayout';
import type { SelectMode } from './gridLayout';

interface Props {
  assets: Asset[];
  total: number;
  selectedIds: Set<string>;
  activeId: string | null;
  onSelect: (id: string, mode: SelectMode, fromId?: string) => void;
  onOpen: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadFailed: boolean;
  onLoadMore: () => void;
}

export function AssetGrid({
  assets, total, selectedIds, activeId, onSelect, onOpen,
  hasMore, loadingMore, loadFailed, onLoadMore,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [firstRow, setFirstRow] = useState(0);
  const anchorItem = useRef(0); // first visible item, survives a re-layout
  const [focusIndex, setFocusIndex] = useState(0); // the roving tab stop
  const [focusRequest, setFocusRequest] = useState(0); // bumps when keys should move real focus

  // Measure the scroll container, and keep measuring (window resize, detail panel opening).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ready = size.w > 0;
  const { cols, colWidth, cardHeight, stride } = useMemo(() => computeLayout(size.w), [size.w]);
  const last = assets.length - 1;
  const rowCount = Math.ceil(assets.length / cols);
  const focusIdx = Math.min(focusIndex, Math.max(0, last));
  const focusRow = Math.floor(focusIdx / cols);

  // When the layout changes, keep the same item at the top, not the same pixel offset.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !ready) return;
    const row = Math.floor(anchorItem.current / cols);
    el.scrollTop = row * stride;
    setFirstRow(row);
  }, [cols, stride, ready]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const row = Math.floor(el.scrollTop / stride);
    anchorItem.current = row * cols;
    setFirstRow(row);
  }

  const first = Math.min(firstRow, Math.max(0, rowCount - 1));
  const viewRows = Math.ceil(size.h / stride) + 1;
  const startRow = Math.max(0, first - OVERSCAN);
  const endRow = Math.min(rowCount, first + viewRows + OVERSCAN);

  // The row that holds focus is always mounted, even when scrolled far away.
  // Otherwise React would delete the focused element and the browser would drop focus.
  const rows: number[] = [];
  if (ready) {
    for (let r = startRow; r < endRow; r++) rows.push(r);
    if (rowCount > 0 && (focusRow < startRow || focusRow >= endRow)) rows.push(focusRow);
  }

  // Infinite scroll. Paused while a load is running or after one failed.
  const loadRef = useRef(onLoadMore);
  loadRef.current = onLoadMore;
  const lastVisibleRow = first + viewRows;
  useEffect(() => {
    if (!ready || !hasMore || loadingMore || loadFailed) return;
    if (lastVisibleRow >= rowCount - PREFETCH_ROWS) loadRef.current();
  }, [ready, hasMore, loadingMore, loadFailed, lastVisibleRow, rowCount]);

  // After a keyboard move, put real focus on the new card once it has rendered.
  useLayoutEffect(() => {
    if (focusRequest === 0) return;
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-index="${focusIdx}"]`)
      ?.focus({ preventScroll: true });
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  function revealRow(row: number) {
    const el = scrollRef.current;
    if (!el) return;
    const top = PAD + row * stride;
    const bottom = top + cardHeight;
    if (top - PAD < el.scrollTop) el.scrollTop = Math.max(0, top - PAD);
    else if (bottom + PAD > el.scrollTop + el.clientHeight) {
      el.scrollTop = bottom + PAD - el.clientHeight;
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const cell = e.target as HTMLElement;
    // Only when a card itself has focus. Keys from the checkbox inside keep native behaviour.
    if (cell.dataset.index === undefined) return;
    const current = Number(cell.dataset.index);
    const currentAsset = assets[current];
    if (!currentAsset) return;

    const rowStart = current - (current % cols);
    const lastRow = Math.floor(last / cols);
    const page = Math.max(1, viewRows - 1) * cols;
    const jump = e.ctrlKey || e.metaKey;
    let next: number;

    switch (e.key) {
      case 'ArrowRight':
        next = current + 1;
        break;
      case 'ArrowLeft':
        next = current - 1;
        break;
      case 'ArrowDown':
        next = current + cols;
        // The last row can be short, so land on its final card, but never wrap or stall.
        if (next > last) next = Math.floor(current / cols) < lastRow ? last : current;
        break;
      case 'ArrowUp':
        next = current - cols;
        break;
      case 'PageDown':
        next = current + page;
        break;
      case 'PageUp':
        next = current - page;
        break;
      case 'Home':
        next = jump ? 0 : rowStart;
        break;
      case 'End':
        next = jump ? last : rowStart + cols - 1;
        break;
      case 'Enter':
        e.preventDefault();
        onOpen(currentAsset.id);
        return;
      case ' ':
        e.preventDefault();
        onSelect(currentAsset.id, 'toggle');
        return;
      default:
        return;
    }

    e.preventDefault(); // stop the arrow keys from scrolling the page
    next = Math.max(0, Math.min(last, next));
    const nextAsset = assets[next];
    if (!nextAsset) return;

    if (e.shiftKey) onSelect(nextAsset.id, 'extend', currentAsset.id);
    else onSelect(nextAsset.id, 'anchor');

    revealRow(Math.floor(next / cols));
    setFocusIndex(next);
    setFocusRequest((n) => n + 1);
  }

  // Mouse clicks and Tab also move the tab stop, so it always follows the user.
  function handleFocus(e: FocusEvent<HTMLDivElement>) {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (cell?.dataset.index !== undefined) setFocusIndex(Number(cell.dataset.index));
  }

  const footerTop = PAD + rowCount * stride;

  return (
    <div
      ref={scrollRef}
      className="vgrid"
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
    >
      <div className="vgrid__inner" style={{ height: footerTop + FOOTER_H }}>
        <div
          role="grid"
          aria-label="Assets"
          aria-multiselectable="true"
          aria-rowcount={Math.max(rowCount, Math.ceil(total / cols))}
          aria-colcount={cols}
        >
          {rows.map((row) => (
            <div
              key={row}
              role="row"
              aria-rowindex={row + 1}
              className="vgrid__row"
              style={{ transform: `translateY(${PAD + row * stride}px)`, height: cardHeight }}
            >
              {assets.slice(row * cols, row * cols + cols).map((asset, col) => {
                const index = row * cols + col;
                return (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    index={index}
                    colIndex={col + 1}
                    selected={selectedIds.has(asset.id)}
                    active={activeId === asset.id}
                    tabbable={index === focusIdx}
                    x={PAD + col * (colWidth + GAP)}
                    width={colWidth}
                    height={cardHeight}
                    onSelect={onSelect}
                    onOpen={onOpen}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {ready && (
          <div className="vgrid__footer muted" style={{ top: footerTop, height: FOOTER_H }}>
            {loadFailed
              ? ''
              : loadingMore
                ? 'Loading more…'
                : hasMore
                  ? ''
                  : `All ${assets.length.toLocaleString()} assets loaded`}
          </div>
        )}
      </div>
    </div>
  );
}
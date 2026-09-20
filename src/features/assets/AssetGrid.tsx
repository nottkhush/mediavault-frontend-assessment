import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Asset } from '@/lib/types';
import { AssetCard } from './AssetCard';
import { computeLayout, FOOTER_H, GAP, OVERSCAN, PAD, PREFETCH_ROWS } from './gridLayout';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadFailed: boolean;
  onLoadMore: () => void;
}

export function AssetGrid({
  assets, selectedIds, activeId, onToggleSelect, onOpen,
  hasMore, loadingMore, loadFailed, onLoadMore,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [firstRow, setFirstRow] = useState(0);
  const anchorItem = useRef(0); // index of the first visible item, survives a re-layout

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
  const rowCount = Math.ceil(assets.length / cols);

  // When the layout changes, keep the same item at the top, not the same pixel offset.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !ready) return;
    const row = Math.floor(anchorItem.current / cols);
    el.scrollTop = row * stride;
    setFirstRow(row);
  }, [cols, stride, ready]);

  // State holds only the first visible row, so React re-renders once per row crossed,
  // not once per scroll event.
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
  const visible = ready ? assets.slice(startRow * cols, endRow * cols) : [];

  // Infinite scroll. Paused while a load is running or after one failed, otherwise a
  // failing request would be re-fired in a loop and burn the rate limit.
  const loadRef = useRef(onLoadMore);
  loadRef.current = onLoadMore;
  const lastVisibleRow = first + viewRows;
  useEffect(() => {
    if (!ready || !hasMore || loadingMore || loadFailed) return;
    if (lastVisibleRow >= rowCount - PREFETCH_ROWS) loadRef.current();
  }, [ready, hasMore, loadingMore, loadFailed, lastVisibleRow, rowCount]);

  const footerTop = PAD + rowCount * stride;

  return (
    <div ref={scrollRef} className="vgrid" onScroll={handleScroll}>
      <div className="vgrid__inner" style={{ height: footerTop + FOOTER_H }}>
        {visible.map((asset, i) => {
          const index = startRow * cols + i;
          const row = Math.floor(index / cols);
          const col = index % cols;
          return (
            <AssetCard
              key={asset.id}
              asset={asset}
              selected={selectedIds.has(asset.id)}
              active={activeId === asset.id}
              x={PAD + col * (colWidth + GAP)}
              y={PAD + row * stride}
              width={colWidth}
              height={cardHeight}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
            />
          );
        })}
        {ready && (
          <div
            className="vgrid__footer muted"
            style={{ top: footerTop, height: FOOTER_H }}
            role="status"
          >
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
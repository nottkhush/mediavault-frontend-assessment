import { memo, useRef, useState } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';
import type { SelectMode } from './gridLayout';
import { StatusPill } from './StatusPill';

function Thumb({ asset }: { asset: Asset }) {
  const [failed, setFailed] = useState(false);
  // hasThumbnail tells us in advance, so we skip the request that would 404.
  // onError still covers a failure we could not predict.
  if (!asset.hasThumbnail || failed) {
    return (
      <div className="card__thumb card__thumb--empty" aria-hidden="true">
        No preview
      </div>
    );
  }
  return (
    <img
      className="card__thumb"
      src={thumbnailUrl(asset.id)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

interface Props {
  asset: Asset;
  index: number; // position in the loaded list, used by the keyboard handler
  colIndex: number; // 1-based, for aria-colindex
  selected: boolean;
  active: boolean;
  tabbable: boolean; // the roving tab stop
  x: number; // left offset inside its row
  width: number;
  height: number;
  onSelect: (id: string, mode: SelectMode, fromId?: string) => void;
  onOpen: (id: string) => void;
}

/** Every prop is a primitive or a stable callback, so memo skips unchanged cards. */
export const AssetCard = memo(function AssetCard({
  asset, index, colIndex, selected, active, tabbable, x, width, height, onSelect, onOpen,
}: Props) {
  const cellRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={cellRef}
      role="gridcell"
      aria-colindex={colIndex}
      aria-selected={selected}
      aria-current={active ? 'true' : undefined}
      aria-label={`${asset.name}, ${asset.kind}, ${statusLabel(asset.status)}, ${formatBytes(
        asset.sizeBytes,
      )}, updated ${formatDate(asset.updatedAt)}`}
      data-index={index}
      data-asset-id={asset.id}
      tabIndex={tabbable ? 0 : -1}
      className={'card' + (selected ? ' card--selected' : '') + (active ? ' card--active' : '')}
      style={{ transform: `translateX(${x}px)`, width, height }}
      onClick={() => onOpen(asset.id)}
    >
      <Thumb asset={asset} />
      <div className="card__body">
        <p className="card__name" title={asset.name}>
          {asset.name}
        </p>
        <p className="muted card__meta">
          {asset.kind} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.updatedAt)}
        </p>
        <StatusPill status={asset.status} />
      </div>
      <input
        type="checkbox"
        className="card__check"
        tabIndex={-1} // not a tab stop, Space on the card does the same job
        aria-label={`Select ${asset.name}`}
        checked={selected}
        onClick={(e) => {
          e.stopPropagation();
          // Keep the keyboard model working after a mouse click.
          cellRef.current?.focus({ preventScroll: true });
        }}
        onChange={(e) =>
          onSelect(asset.id, (e.nativeEvent as MouseEvent).shiftKey ? 'extend' : 'toggle')
        }
      />
    </div>
  );
});
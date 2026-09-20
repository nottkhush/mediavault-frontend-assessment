import { memo, useState } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

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
      width={320}
      height={200}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

interface Props {
  asset: Asset;
  selected: boolean;
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

/**
 * Every prop is a primitive, the asset object, or a stable callback, so memo
 * can skip the card unless something about this card actually changed.
 */
export const AssetCard = memo(function AssetCard({
  asset, selected, active, x, y, width, height, onToggleSelect, onOpen,
}: Props) {
  return (
    <div
      className={'card' + (selected ? ' card--selected' : '') + (active ? ' card--active' : '')}
      style={{ transform: `translate(${x}px, ${y}px)`, width, height }}
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
        <span className={`pill pill--${asset.status}`}>{statusLabel(asset.status)}</span>
      </div>
      <input
        type="checkbox"
        className="card__check"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleSelect(asset.id)}
      />
    </div>
  );
});
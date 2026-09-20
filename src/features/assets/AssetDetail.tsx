import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAsset, thumbnailUrl } from "@/api/client";
import { describeError } from "@/lib/errors";
import {
  formatBytes,
  formatDate,
  formatDuration,
  statusLabel,
} from "@/lib/format";
import type { Asset, AssetStatus } from "@/lib/types";
import { assetKey, saveStatus } from "./statusEdit";
import { useEffect, useRef, useState } from 'react';

const STATUSES: AssetStatus[] = ["draft", "in_review", "approved", "archived"];

interface Props {
  id: string;
  onClose: () => void;
}

export function AssetDetail({ id, onClose }: Props) {
  const queryClient = useQueryClient();
  const {
    data: asset,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: assetKey(id),
    queryFn: ({ signal }) => getAsset(id, signal),
    staleTime: 0, // show the cached copy instantly, but always check it
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    current: Asset;
    wanted: AssetStatus;
  } | null>(null);
    const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.focus(); // opening the panel moves focus into it
  }, []);

  async function change(wanted: AssetStatus, from: Asset) {
    setSaving(true);
    setSaveError(null);
    setConflict(null);
    const result = await saveStatus(queryClient, from, wanted);
    setSaving(false);
    if (result.kind === "conflict") {
      setConflict({ current: result.current, wanted: result.wanted });
    } else if (result.kind === "failed") {
      setSaveError(
        describeError(result.error, "We couldn't save that change."),
      );
    }
  }

  return (
        <aside ref={panelRef} className="panel" tabIndex={-1} aria-label="Asset detail">
      <div className="panel__head">
        <h2>Asset detail</h2>
        <button onClick={onClose}>Close</button>
      </div>

      {loadError && !asset && (
        <div role="alert">
          <p className="error">
            {describeError(loadError, "Couldn't load this asset.")}
          </p>
          <button onClick={() => refetch()}>Try again</button>
        </div>
      )}
      {!asset && !loadError && <p className="muted">Loading…</p>}

      {asset && (
        <div className="panel__body">
          {asset.hasThumbnail ? (
            <img className="panel__thumb" src={thumbnailUrl(asset.id)} alt="" />
          ) : (
            <div className="panel__thumb panel__thumb--empty">No preview</div>
          )}
          <h3>{asset.name}</h3>
          <dl className="facts">
            <dt>Id</dt>
            <dd>{asset.id}</dd>
            <dt>Kind</dt>
            <dd>{asset.kind}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(asset.sizeBytes)}</dd>
            {asset.width != null && (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {asset.width}×{asset.height}
                </dd>
              </>
            )}
            {asset.durationSec != null && (
              <>
                <dt>Duration</dt>
                <dd>{formatDuration(asset.durationSec)}</dd>
              </>
            )}
            <dt>Owner</dt>
            <dd>{asset.owner.name}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(asset.updatedAt)}</dd>
            <dt>Version</dt>
            <dd>{asset.version}</dd>
          </dl>

          {asset.tags.length > 0 && (
            <ul className="tags">
              {asset.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}

                    <p className="muted" id="status-label">
            Status
          </p>
          <div className="segmented" role="group" aria-labelledby="status-label">
            {STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className="segmented__btn"
                aria-pressed={status === asset.status}
                aria-disabled={saving}
                onClick={() => {
                  if (saving || status === asset.status) return;
                  void change(status, asset);
                }}
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>

          {saveError && (
            <p className="error" role="alert">
              {saveError}
            </p>
          )}

          {conflict && (
            <div className="panel__alert" role="alert">
              <p>
                Someone else changed this asset while you were editing. It is
                now {statusLabel(conflict.current.status)}, so your change to{" "}
                {statusLabel(conflict.wanted)} was not applied.
              </p>
              <div className="row">
                <button
                  onClick={() => change(conflict.wanted, conflict.current)}
                >
                  Set to {statusLabel(conflict.wanted)} anyway
                </button>
                <button onClick={() => setConflict(null)}>Keep current</button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

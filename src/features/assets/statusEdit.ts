import type { QueryClient } from "@tanstack/react-query";
import { ApiError, getAsset, updateAsset } from "@/api/client";
import { withRetry } from "@/api/retry";
import type { Asset, AssetStatus } from "@/lib/types";
import { applyOptimisticStatus, patchAssetsInCache } from "./assetCache";
import { isOffline } from '@/api/online';

export const assetKey = (id: string) => ["asset", id] as const;

export type EditResult =
  | { kind: "saved"; asset: Asset }
  | { kind: "conflict"; current: Asset; wanted: AssetStatus }
  | { kind: "failed"; error: unknown };

/**
 * Optimistic single-asset status change. The detail cache and every cached
 * list flip immediately. On failure they go back exactly.
 */
export async function saveStatus(
  qc: QueryClient,
  base: Asset,
  wanted: AssetStatus,
): Promise<EditResult> {
  const id = base.id;
    // No network: don't flip anything we'd only have to flip back.
  if (isOffline()) {
    return {
      kind: 'failed',
      error: new ApiError({ status: 0, code: 'offline', message: 'You are offline.' }),
    };
  }

  // A refetch already in flight would overwrite our optimistic value with old data.
  await qc.cancelQueries({ queryKey: assetKey(id) });

  const previous = applyOptimisticStatus(qc, new Set([id]), wanted);
  qc.setQueryData<Asset>(assetKey(id), { ...base, status: wanted });

  /** Server copies are always at least as new as any client copy, so they can replace freely. */
  const settle = (asset: Asset) => {
    qc.setQueryData<Asset>(assetKey(id), asset);
    patchAssetsInCache(qc, [asset]);
    qc.invalidateQueries({ queryKey: ["assets"], refetchType: "none" });
  };

  const rollback = () => {
    const prev = previous.get(id);
    if (prev) patchAssetsInCache(qc, [prev]);
    qc.setQueryData<Asset>(assetKey(id), base);
  };

  try {
    const saved = await withRetry(() =>
      updateAsset(id, base.version, { status: wanted }),
    );
    settle(saved);
    return { kind: "saved", asset: saved };
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== "version_conflict") {
      rollback();
      return { kind: "failed", error: err };
    }
  }

  // 409: the row changed underneath us. Fetch the truth before deciding anything.
  let current: Asset;
  try {
    current = await withRetry(() => getAsset(id));
  } catch (err) {
    rollback();
    return { kind: "failed", error: err };
  }

  // Already where the user wanted (someone else, or our own PATCH whose reply was lost).
  if (current.status === wanted) {
    settle(current);
    return { kind: "saved", asset: current };
  }

  // Status untouched, other fields changed: not a real conflict, so reapply once.
  if (current.status === base.status) {
    try {
      const saved = await withRetry(() =>
        updateAsset(id, current.version, { status: wanted }),
      );
      settle(saved);
      return { kind: "saved", asset: saved };
    } catch (err) {
      settle(current);
      if (err instanceof ApiError && err.code === "version_conflict") {
        return { kind: "conflict", current, wanted };
      }
      return { kind: "failed", error: err };
    }
  }

  // Someone else decided a different status. Show the truth and let the user choose.
  settle(current);
  return { kind: "conflict", current, wanted };
}

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { AssetKind, AssetQuery, AssetStatus } from '@/lib/types';

export type Sort = NonNullable<AssetQuery['sort']>;

export interface ViewQuery {
  q: string;
  status: AssetStatus[];
  kind: AssetKind[];
  tag: string[];
  collectionId: string;
  owner: string;
  sort: Sort;
}

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const KINDS: AssetKind[] = ['image', 'video', 'document'];
const SORTS: Sort[] = [
  'updatedAt:desc', 'updatedAt:asc', 'name:asc', 'name:desc', 'sizeBytes:desc', 'createdAt:desc',
];
export const DEFAULT_SORT: Sort = 'updatedAt:desc';

/** Keeps only known values, dedupes, and sorts so the same filters give the same URL. */
function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const ok = new Set<string>(allowed);
  const values = raw.split(',').map((s) => s.trim()).filter((s) => ok.has(s)) as T[];
  return [...new Set(values)].sort();
}

function parseFree(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].sort();
}

/** Never throws. Anything unknown or malformed falls back to a default. */
export function parseSearch(search: string): ViewQuery {
  const p = new URLSearchParams(search);
  const sort = p.get('sort');
  return {
    q: p.get('q') ?? '',
    status: parseList(p.get('status'), STATUSES),
    kind: parseList(p.get('kind'), KINDS),
    tag: parseFree(p.get('tag')),
    collectionId: p.get('collectionId') ?? '',
    owner: p.get('owner') ?? '',
    sort: SORTS.includes(sort as Sort) ? (sort as Sort) : DEFAULT_SORT,
  };
}

/** Canonical and minimal: defaults are omitted, lists are sorted. */
export function toUrlSearch(v: ViewQuery): string {
  const p = new URLSearchParams();
  if (v.q) p.set('q', v.q);
  if (v.status.length) p.set('status', [...v.status].sort().join(','));
  if (v.kind.length) p.set('kind', [...v.kind].sort().join(','));
  if (v.tag.length) p.set('tag', [...v.tag].sort().join(','));
  if (v.collectionId) p.set('collectionId', v.collectionId);
  if (v.owner) p.set('owner', v.owner);
  if (v.sort !== DEFAULT_SORT) p.set('sort', v.sort);
  const s = p.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}

const URL_EVENT = 'mv:urlchange';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange); // back / forward
  window.addEventListener(URL_EVENT, onChange); // our own writes
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(URL_EVENT, onChange);
  };
}
const getSnapshot = () => window.location.search;

/**
 * push: creates a history entry (filters, sort), so Back undoes it.
 * replace: edits the current entry (typing), so Back is not flooded.
 */
export function useViewQuery() {
  const search = useSyncExternalStore(subscribe, getSnapshot, () => '');
  const view = useMemo(() => parseSearch(search), [search]);

  const update = useCallback(
    (patch: Partial<ViewQuery>, mode: 'push' | 'replace' = 'push') => {
      // Read the live URL, not a closure, so two updates in one tick don't clobber each other.
      const next = { ...parseSearch(window.location.search), ...patch };
      const target = window.location.pathname + toUrlSearch(next);
      if (target === window.location.pathname + window.location.search) return;
      window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', target);
      window.dispatchEvent(new Event(URL_EVENT));
    },
    [],
  );

  return [view, update] as const;
}
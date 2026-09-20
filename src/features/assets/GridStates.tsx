import { describeError, errorReference } from "@/lib/errors";

export function GridSkeleton({ retrying, offline }: { retrying: boolean; offline: boolean }) {
  return (
        <div className="empty empty--error" role="alert">
      <p className="muted grid__status" role="status">
        {offline
          ? "You're offline. Assets will load when you reconnect."
          : retrying
            ? 'Taking longer than usual. Retrying…'
            : 'Loading assets…'}
      </p>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="card card--skeleton" aria-hidden="true">
          <div className="card__thumb" />
          <div className="card__body">
            <span className="skeleton-line" />
            <span className="skeleton-line skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GridEmpty({ q, onClear }: { q: string; onClear: () => void }) {
  return (
    <div className="empty">
      <p>{q ? `No assets match “${q}”.` : "No assets match these filters."}</p>
      <p className="muted">Try a shorter search or fewer filters.</p>
      <div className="row">
        <button onClick={onClear}>Clear search and filters</button>
      </div>
    </div>
  );
}

export function GridError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const ref = errorReference(error);
  return (
    <div className="empty" role="alert">
      <p>{describeError(error)}</p>
      {ref && <p className="muted">Reference: {ref}</p>}
      <div className="row">
        <button onClick={onRetry}>Try again</button>
      </div>
    </div>
  );
}

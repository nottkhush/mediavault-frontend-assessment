import { statusLabel } from '@/lib/format';
import type { BulkState } from './bulk';

interface Props {
  state: BulkState;
  onRetry: () => void;
  onDismiss: () => void;
}

const assets = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'asset' : 'assets'}`;

export function BulkNotice({ state, onRetry, onDismiss }: Props) {
  if (state.phase === 'idle') return null;

  if (state.phase === 'running') {
    return (
      <p className="notice" role="status">
        Updating {state.done.toLocaleString()} of {state.total.toLocaleString()}…
      </p>
    );
  }

  const { failed, applied, status } = state;
  const label = statusLabel(status).toLowerCase();

  if (failed.length === 0) {
    return (
      <p className="notice" role="status">
        {assets(applied)} set to {label}.
        <button onClick={onDismiss}>Dismiss</button>
      </p>
    );
  }

  const onHold = failed.filter((f) => f.code === 'legal_hold').length;
  const temporary = failed.filter((f) => f.retryable).length;
  const other = failed.length - onHold - temporary;
  const reasons = [
    onHold > 0 && `${onHold.toLocaleString()} on legal hold`,
    temporary > 0 && `${temporary.toLocaleString()} hit a temporary error`,
    other > 0 && `${other.toLocaleString()} could not be found or changed`,
  ].filter(Boolean);

  return (
    <p className="notice" role="alert">
      {assets(applied)} set to {label}. {assets(failed.length)} could not be changed (
      {reasons.join(', ')}). They stay selected.
      {temporary > 0 && <button onClick={onRetry}>Retry {temporary.toLocaleString()}</button>}
      <button onClick={onDismiss}>Dismiss</button>
    </p>
  );
}
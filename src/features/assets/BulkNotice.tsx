import { statusLabel } from '@/lib/format';
import type { BulkState } from './bulk';

interface Props {
  state: BulkState;
  onRetry: () => void;
  onDismiss: () => void;
}

const assets = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'asset' : 'assets'}`;
const isConnection = (code: string) => code === 'offline' || code === 'network_error';

function summarise(state: Extract<BulkState, { phase: 'done' }>) {
  const { failed, applied, status } = state;
  const label = statusLabel(status).toLowerCase();
  if (failed.length === 0) return { text: `${assets(applied)} set to ${label}.`, retryable: 0 };

  const onHold = failed.filter((f) => f.code === 'legal_hold').length;
  const connection = failed.filter((f) => isConnection(f.code)).length;
  const temporary = failed.filter((f) => f.retryable && !isConnection(f.code)).length;
  const other = failed.length - onHold - connection - temporary;
  const reasons = [
    onHold > 0 && `${onHold.toLocaleString()} on legal hold`,
    connection > 0 && `${connection.toLocaleString()} lost connection`,
    temporary > 0 && `${temporary.toLocaleString()} hit a temporary error`,
    other > 0 && `${other.toLocaleString()} could not be found or changed`,
  ].filter(Boolean);

  return {
    text: `${assets(applied)} set to ${label}. ${assets(failed.length)} could not be changed (${reasons.join(', ')}). They stay selected.`,
    retryable: connection + temporary,
  };
}

/** The text for the screen reader announcement. It stays constant during a run. */
export function describeBulk(state: BulkState): string {
  if (state.phase === 'idle') return '';
  if (state.phase === 'running') return `Updating ${assets(state.total)}.`;
  return summarise(state).text;
}

export function BulkNotice({ state, onRetry, onDismiss }: Props) {
  if (state.phase === 'idle') return null;

  if (state.phase === 'running') {
    return (
      <p className="notice">
        Updating {state.done.toLocaleString()} of {state.total.toLocaleString()}…
      </p>
    );
  }

  const { text, retryable } = summarise(state);
  const clean = state.failed.length === 0;
  return (
    <p className={`notice ${clean ? 'notice--ok' : 'notice--warn'}`}>
      <span className="notice__icon" aria-hidden="true">
        {clean ? '✓' : '!'}
      </span>
      <span>{text}</span>
      {retryable > 0 && <button onClick={onRetry}>Retry {retryable.toLocaleString()}</button>}
      <button onClick={onDismiss}>Dismiss</button>
    </p>
  );
}
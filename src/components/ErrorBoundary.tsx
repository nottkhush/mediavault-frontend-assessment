import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label: string; // "the asset list", used in the message
  resetKey?: string; // when this changes, the boundary tries again by itself
  className?: string; // layout class for the fallback
}

interface State {
  error: Error | null;
}

/**
 * Catches errors thrown while rendering. It cannot catch errors in event
 * handlers or async code. Those are handled as data (ApiError) elsewhere.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary: ${this.props.label}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={this.props.className ?? 'empty'} role="alert">
        <p>Something went wrong while showing {this.props.label}.</p>
        <p className="muted">The rest of the page is still working.</p>
        <div className="row">
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <button onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    );
  }
}
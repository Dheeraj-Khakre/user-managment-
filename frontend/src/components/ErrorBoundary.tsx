import { Component, type ReactNode } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryState { hasError: boolean }

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary">
          <span><ShieldAlert size={25} /></span>
          <h1>This view could not be opened.</h1>
          <p>Reload the view to continue. Changes already submitted may have succeeded.</p>
          <button className="button button-primary" onClick={() => window.location.reload()}><RefreshCw size={15} />Reload workspace</button>
        </main>
      );
    }
    return this.props.children;
  }
}
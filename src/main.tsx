import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unexpected client error.',
    };
  }

  private handleResetAndReload = () => {
    try {
      window.localStorage.removeItem('synout_profile');
      window.localStorage.removeItem('synout_results');
      window.localStorage.removeItem('synout_deindex_queue_v1');
      window.localStorage.removeItem('synout_scan_snapshots_v1');
      window.sessionStorage.setItem('synout_splash_shown', 'true');
    } catch {
      // Ignore storage restrictions
    }
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="text-xs font-mono text-emerald-400">synOUT Recovery</div>
            <h1 className="text-lg font-bold text-white">Session State Reset Required</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {this.state.errorMessage || 'A cached local state entry encountered a format mismatch.'}
            </p>
            <button
              type="button"
              onClick={this.handleResetAndReload}
              className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Reset Cached Workspace &amp; Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

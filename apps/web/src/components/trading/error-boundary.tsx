'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error boundary caught', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
          <div className="max-w-md rounded-xl border border-rose-800 bg-slate-900 p-6">
            <h1 className="text-lg font-semibold text-rose-300">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-400">
              The trading screen hit an unexpected error. Refresh the page to recover.
            </p>
            <pre className="mt-4 overflow-auto rounded bg-slate-950 p-3 text-xs text-rose-200">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

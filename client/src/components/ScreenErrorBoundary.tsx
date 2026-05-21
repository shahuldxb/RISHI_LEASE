/**
 * ScreenErrorBoundary — React class ErrorBoundary that:
 *  1. Catches any JS error thrown inside the wrapped subtree.
 *  2. Reports it to the server via a plain fetch (can't use tRPC hooks in a class component).
 *  3. Renders a friendly error card with screen ID and username.
 *
 * Wrap DashboardLayout children with this boundary so every page is covered.
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  screenId?: string;
  screenTitle?: string;
  username?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
}

export class ScreenErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', errorStack: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'Unknown error',
      errorStack: error?.stack ?? '',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const { screenId = 'UNKNOWN', screenTitle } = this.props;

    // Report to backend via tRPC HTTP endpoint directly (no hooks in class components)
    fetch('/api/trpc/compliance.logScreenError', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json: {
          screenId,
          errorCode: `FE-${screenId}`,
          message: error?.message ?? 'Unknown error',
          stackTrace: (error?.stack ?? '') + '\n\nComponent Stack:\n' + (info?.componentStack ?? ''),
        },
      }),
    }).catch(() => { /* silent — never block the error UI */ });
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '', errorStack: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { screenId = 'UNKNOWN', screenTitle, username } = this.props;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 gap-6">
        <div className="max-w-lg w-full rounded-xl border border-destructive/40 bg-destructive/5 p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-destructive">Screen Error</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                An unexpected error occurred on this screen.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/60 p-3 text-sm font-mono text-foreground mb-4 break-all">
            {this.state.errorMessage}
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-5">
            <span className="rounded bg-muted px-2 py-0.5">
              Screen: <strong>{screenTitle ?? screenId}</strong>
            </span>
            <span className="rounded bg-muted px-2 py-0.5">
              ID: <strong>{screenId}</strong>
            </span>
            {username && (
              <span className="rounded bg-muted px-2 py-0.5">
                User: <strong>{username}</strong>
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={this.handleReset}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Try Again
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

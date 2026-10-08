import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button, LogoMark } from './ui';

/* ---------------------------------------------------------------- Shared screen */

/** Full-page, paper-and-ink "something went wrong" screen. */
export function ErrorScreen({
  title = 'Something went wrong',
  body = 'An unexpected error stopped this page from loading. You can reload, or head back home.',
  showReload = true,
  showHome = true,
  notFound = false,
  onRetry,
}: {
  title?: string;
  body?: string;
  showReload?: boolean;
  showHome?: boolean;
  notFound?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 rotate-6 rounded-[26px] bg-accent-soft" />
        <span className="absolute inset-0 -rotate-3 rounded-[26px] border border-line bg-card shadow-paper" />
        <LogoMark className="relative size-10" tile={false} />
      </div>
      <div className="max-w-[420px]">
        <h1 className="text-[1.75rem] font-extrabold leading-tight">{notFound ? 'Lost the thread' : title}</h1>
        <p className="mt-2 text-[0.9375rem] text-fg-muted">{body}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <Button size="lg" onClick={onRetry}>
            Retry
          </Button>
        )}
        {showReload && !notFound && (
          <Button size="lg" variant={onRetry ? 'outline' : 'primary'} onClick={() => window.location.reload()}>
            Reload
          </Button>
        )}
        {showHome && (
          <Link to="/home">
            <Button size="lg" variant={notFound || onRetry ? 'outline' : 'primary'}>
              Go home
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Router errorElement */

/** Used as the route-level `errorElement`. Also handles 404 route responses. */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <ErrorScreen notFound body="The link may be broken, or the page may have been removed." showReload={false} />;
  }
  const message = error instanceof Error ? error.message : undefined;
  return (
    <ErrorScreen
      body={message ? `An unexpected error stopped this page from loading. (${message})` : 'An unexpected error stopped this page from loading. You can reload, or head back home.'}
    />
  );
}

/* ---------------------------------------------------------------- React boundary */

interface State {
  error: Error | null;
}

/**
 * App-level React error boundary for render errors thrown outside the router's
 * data flow (event handlers aside). Catches, logs, and shows the friendly
 * screen with a reset.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in dev tools; a real app would ship this to an error tracker.
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? <ErrorScreen />;
    }
    return this.props.children;
  }
}

/* ---------------------------------------------------------------- Card boundary */

interface CardState {
  failed: boolean;
}

/**
 * Cheap, self-contained boundary for a single card/section. A deep failure in
 * one note or widget degrades to a small inline notice instead of taking down
 * the whole page.
 */
export class CardBoundary extends Component<{ children: ReactNode; label?: string }, CardState> {
  state: CardState = { failed: false };

  static getDerivedStateFromError(): CardState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('Card render error:', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-[var(--radius-card)] border border-line bg-card px-4 py-3 text-[0.875rem] text-fg-muted" role="alert">
          {this.props.label ?? 'This couldn’t be shown.'}
        </div>
      );
    }
    return this.props.children;
  }
}

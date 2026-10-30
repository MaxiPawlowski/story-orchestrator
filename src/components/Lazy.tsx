import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { resetFailedLazies } from "@utils/lazyRetry";
import { log } from "@utils/log";
import { Skeleton } from "@components/ui/Skeleton";

export const LAZY_FAILED_TEXT = "Couldn't load — reload SillyTavern";

interface BoundaryProps {
  children: ReactNode;
  onError?: (error: unknown) => void;
  quiet?: boolean;
}

export class LazyBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    log.warn("a lazy part of the Story Orchestrator UI failed to load", error, info.componentStack);
    this.props.onError?.(error);
  }

  retry = () => {
    resetFailedLazies();
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div data-so="lazy-failed" role="alert" className="so-status-text so-lazy-failed" data-tone="error">
        {LAZY_FAILED_TEXT}
        <button type="button" data-so="lazy-retry" className="so-btn" onClick={this.retry}>Retry</button>
      </div>
    );
  }
}

export const Lazy = ({ children, fallback, onError, quiet }: { children: ReactNode; fallback?: ReactNode; onError?: (error: unknown) => void; quiet?: boolean }) => (
  <LazyBoundary onError={onError} quiet={quiet}>
    <Suspense fallback={fallback === undefined ? (quiet ? null : <Skeleton />) : fallback}>{children}</Suspense>
  </LazyBoundary>
);

export default Lazy;

"use client";

// Segment error boundary for the PR-detail route: an unexpected render crash
// here stays isolated to this panel (with a retry) instead of bubbling to the
// root boundary and blanking the whole studio.
import { ErrorState } from "@devdigest/ui";

export default function PrDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState title="Couldn't load this pull request" body={error.message} onRetry={reset} />;
}

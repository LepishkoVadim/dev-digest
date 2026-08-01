"use client";

// Root error boundary — catches render exceptions anywhere in the page tree
// (API errors are already handled inline by React Query). `reset` re-renders the
// segment. Reuses the shared ErrorState primitive so it matches the inline UX.
import { ErrorState } from "@devdigest/ui";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState fullScreen title="Something went wrong" body={error.message} onRetry={reset} />;
}

// Route-level loading fallback shown during navigation / code-split of a segment.
import { Skeleton } from "@devdigest/ui";

export default function Loading() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      <Skeleton width={220} height={22} />
      <Skeleton height={60} />
      <Skeleton height={60} />
      <Skeleton height={60} />
    </div>
  );
}

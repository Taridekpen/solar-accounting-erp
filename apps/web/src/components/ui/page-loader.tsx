import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-primary", className)} aria-hidden />;
}

export function PageLoader({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-card px-6 py-16 text-center",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner className="h-8 w-8" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-full max-w-sm" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

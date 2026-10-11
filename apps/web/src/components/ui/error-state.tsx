import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-card px-6 py-16 text-center" role="alert">
      <AlertTriangle className="mb-3 h-6 w-6 text-rose-500" />
      <h2 className="text-base font-semibold text-ink">Something went wrong</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

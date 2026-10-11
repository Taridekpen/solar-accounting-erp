import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon ? (
        <div className="mb-3 rounded-xl bg-canvas p-3 text-muted">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
    </div>
  );
}

import type { DashboardPreset } from "@solar/shared";
import { useUi } from "@/stores/ui-context";

const presets: { value: DashboardPreset; label: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

export function DateRangeFilter({ fromLabel, toLabel }: { fromLabel?: string; toLabel?: string }) {
  const { preset, setPreset, from, to, setCustomRange } = useUi();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor="period-preset">
        Date preset
      </label>
      <select
        id="period-preset"
        className="h-10 rounded-lg border border-line bg-card px-3 text-sm"
        value={preset}
        onChange={(event) => setPreset(event.target.value as DashboardPreset)}
      >
        {presets.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="h-10 rounded-lg border border-line bg-card px-3 text-sm text-muted"
        disabled
        title="Financial periods are created with the fiscal calendar"
      >
        Financial period
      </button>
      {preset === "custom" ? (
        <>
          <input
            aria-label="From date"
            type="date"
            className="h-10 rounded-lg border border-line bg-card px-3 text-sm"
            value={from}
            onChange={(event) => setCustomRange(event.target.value, to)}
          />
          <input
            aria-label="To date"
            type="date"
            className="h-10 rounded-lg border border-line bg-card px-3 text-sm"
            value={to}
            onChange={(event) => setCustomRange(from, event.target.value)}
          />
        </>
      ) : (
        <span className="inline-flex h-10 items-center rounded-lg border border-line bg-card px-3 text-sm text-muted">
          {fromLabel && toLabel ? `${fromLabel} - ${toLabel}` : "Loading dates"}
        </span>
      )}
    </div>
  );
}

export function formatBusinessDate(value: string, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

import type { DashboardDetail, DashboardPreset, DashboardSummary } from "@solar/shared";

export function apiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || "https://accounting-api.internalgethelpsupport.com";
}

let activeBranchIds: string[] = [];

export function setActiveBranchFilter(branchIds: string[]) {
  activeBranchIds = branchIds;
}

function csrfToken(): string | undefined {
  const parts = document.cookie.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith("solar_csrf="));
  return match ? decodeURIComponent(match.slice("solar_csrf=".length)) : undefined;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (activeBranchIds.length > 0 && !headers.has("X-Branch-Ids")) {
    headers.set("X-Branch-Ids", activeBranchIds.join(","));
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = csrfToken();
    if (csrf && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrf);
    }
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }
  const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = payload?.message;
    const error = new Error(Array.isArray(message) ? message.join(", ") : message || `Request failed (${response.status})`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export async function fetchDashboardSummary(input: {
  preset: DashboardPreset;
  from?: string;
  to?: string;
}): Promise<DashboardSummary> {
  const params = new URLSearchParams({ preset: input.preset });
  if (input.preset === "custom" && input.from && input.to) {
    params.set("from", `${input.from}T00:00:00.000Z`);
    params.set("to", `${input.to}T23:59:59.999Z`);
  }
  return apiRequest<DashboardSummary>(`/dashboard/summary?${params.toString()}`);
}

export async function fetchDashboardDetails(input: {
  metric: string;
  preset: DashboardPreset;
  from?: string;
  to?: string;
}): Promise<DashboardDetail> {
  const params = new URLSearchParams({ metric: input.metric, preset: input.preset });
  if (input.preset === "custom" && input.from && input.to) {
    params.set("from", `${input.from}T00:00:00.000Z`);
    params.set("to", `${input.to}T23:59:59.999Z`);
  }
  return apiRequest<DashboardDetail>(`/dashboard/details?${params.toString()}`);
}

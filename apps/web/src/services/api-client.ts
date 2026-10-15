import type { DashboardDetail, DashboardPreset, DashboardSummary } from "@solar/shared";

const CSRF_STORAGE_KEY = "solar_csrf_token";

export function apiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || "https://accounting-api.internalgethelpsupport.com";
}

let activeBranchIds: string[] = [];
let csrfFromApi: string | undefined = readStoredCsrf();

export function setActiveBranchFilter(branchIds: string[]) {
  activeBranchIds = branchIds;
}

/** Remember CSRF from login (or other) JSON — required when web and API are on different hosts. */
export function setCsrfToken(token: string | undefined) {
  csrfFromApi = token || undefined;
  try {
    if (token) {
      sessionStorage.setItem(CSRF_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(CSRF_STORAGE_KEY);
    }
  } catch {
    /* private mode / blocked storage */
  }
}

export function clearCsrfToken() {
  setCsrfToken(undefined);
}

function readStoredCsrf(): string | undefined {
  try {
    return sessionStorage.getItem(CSRF_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function csrfToken(): string | undefined {
  if (csrfFromApi) {
    return csrfFromApi;
  }
  const parts = document.cookie.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith("solar_csrf="));
  return match ? decodeURIComponent(match.slice("solar_csrf=".length)) : undefined;
}

function rememberCsrfFromBody(body: unknown) {
  if (body && typeof body === "object" && "csrfToken" in body) {
    const token = (body as { csrfToken?: unknown }).csrfToken;
    if (typeof token === "string" && token.length > 0) {
      setCsrfToken(token);
    }
  }
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
    if (response.status === 401) {
      clearCsrfToken();
    }
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = payload?.message;
    const error = new Error(Array.isArray(message) ? message.join(", ") : message || `Request failed (${response.status})`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const data = (await response.json()) as T;
  rememberCsrfFromBody(data);
  return data;
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

export interface DashboardTransactionDetail {
  id: string;
  journalNumber: string;
  accountingDate: string;
  description: string;
  status: string;
  sourceDocumentType: string;
  postedAt: string | null;
  lines: Array<{
    id: string;
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
    description: string | null;
  }>;
}

export function fetchDashboardTransaction(id: string) {
  return apiRequest<DashboardTransactionDetail>(`/dashboard/transactions/${id}`);
}

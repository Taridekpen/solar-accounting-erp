import { apiRequest } from "@/services/api-client";

export interface SessionBranch {
  id: string;
  name: string;
  branchCode: string;
  status: "active" | "inactive";
}

export interface SessionView {
  mfaPending: boolean;
  companyWide: boolean;
  permissions: string[];
  roleCodes: string[];
  user: { id: string; email: string; status: string; mfaEnabled: boolean };
  branches: SessionBranch[];
  csrfToken?: string;
  status?: string;
}

export interface StaffUser {
  id: string;
  email: string;
  status: string;
  mfaEnabled: boolean;
  roles: { code: string; name: string }[];
  branches: { id: string; name: string }[];
}

export function fetchSession() {
  return apiRequest<SessionView>("/auth/session");
}

export function login(body: { email: string; password: string; totp?: string }) {
  return apiRequest<SessionView>("/auth/login", { method: "POST", body: JSON.stringify(body) });
}

export function logout() {
  return apiRequest<{ status: string }>("/auth/logout", { method: "POST" });
}

export function enrollMfa() {
  return apiRequest<{ secret: string; uri: string }>("/auth/mfa/enroll", { method: "POST" });
}

export function verifyMfa(code: string) {
  return apiRequest<{ status: string }>("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code }) });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ status: string }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function fetchUsers() {
  return apiRequest<StaffUser[]>("/users");
}

export function inviteUser(body: { email: string; roleCodes: string[]; branchIds?: string[] }) {
  return apiRequest<{ id: string; email: string; invitationToken: string }>("/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function suspendUser(id: string) {
  return apiRequest<void>(`/users/${id}/status`, { method: "PATCH" });
}

export function updateUser(id: string, body: { roleCodes?: string[]; branchIds?: string[] }) {
  return apiRequest<{ status: string }>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function fetchUserSessions(id: string) {
  return apiRequest<{ id: string; createdAt: string; revokedAt: string | null; userAgent: string | null }[]>(
    `/users/${id}/sessions`,
  );
}

export function revokeSession(id: string) {
  return apiRequest<{ status: string }>(`/auth/sessions/${id}`, { method: "DELETE" });
}

export function fetchRoles() {
  return apiRequest<{ id: string; code: string; name: string; permissions: string[] }[]>("/roles");
}

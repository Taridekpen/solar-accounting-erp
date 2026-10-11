import { apiRequest } from "@/services/api-client";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
}

export function fetchNotifications() {
  return apiRequest<NotificationRow[]>("/notifications");
}

export function fetchUnreadNotificationCount() {
  return apiRequest<{ count: number }>("/notifications/unread-count");
}

export function refreshNotifications() {
  return apiRequest<NotificationRow[]>("/notifications/refresh", { method: "POST", body: "{}" });
}

export function markNotificationRead(id: string) {
  return apiRequest<NotificationRow>(`/notifications/${id}/read`, { method: "POST", body: "{}" });
}

export function markAllNotificationsRead() {
  return apiRequest<{ ok: boolean }>("/notifications/read-all", { method: "POST", body: "{}" });
}

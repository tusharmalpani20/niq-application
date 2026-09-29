export type InboxItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

export type Inbox = { items: InboxItem[]; unreadCount: number };

const base = (organizationId: string) => `/api/v1/organizations/${encodeURIComponent(organizationId)}/notifications`;

export class NotificationRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(url: string, method = "GET", signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, credentials: "include", signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new NotificationRequestError(data?.error?.message ?? "Notifications could not be loaded. Please try again.", response.status);
  return data as T;
}

export const getInbox = (organizationId: string, signal?: AbortSignal) => request<Inbox>(base(organizationId), "GET", signal);
export const markNotificationRead = (organizationId: string, id: string) => request<unknown>(`${base(organizationId)}/${encodeURIComponent(id)}/read`, "POST");
export const markAllNotificationsRead = (organizationId: string) => request<unknown>(`${base(organizationId)}/read-all`, "POST");
export const dismissNotification = (organizationId: string, id: string) => request<unknown>(`${base(organizationId)}/${encodeURIComponent(id)}/dismiss`, "POST");
export const dismissAllNotifications = (organizationId: string) => request<unknown>(`${base(organizationId)}/dismiss-all`, "POST");

// Notification destinations are app routes supplied by the server, never external URLs.
export function safeNotificationHref(href: string | null): string | null {
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.includes("\\") || /[\u0000-\u001f]/.test(href)) return null;
  return href;
}

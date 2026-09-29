import { expect, test } from "bun:test";
import { dismissAllNotifications, dismissNotification, getInbox, markAllNotificationsRead, markNotificationRead, NotificationRequestError, safeNotificationHref } from "./notification-api";

test("notification destinations stay within the app", () => {
  expect(safeNotificationHref("/assessments/ASM-1")).toBe("/assessments/ASM-1");
  expect(safeNotificationHref("https://example.com")).toBeNull();
  expect(safeNotificationHref("//example.com")).toBeNull();
  expect(safeNotificationHref("/\\example.com")).toBeNull();
  expect(safeNotificationHref("/assessments/\nexample.com")).toBeNull();
});

test("an inbox authorization failure retains its status for cache clearing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ error: { message: "Sign in is required." } }, { status: 401 })) as typeof fetch;
  try { await expect(getInbox("org")).rejects.toMatchObject({ status: 401, message: "Sign in is required." } satisfies Partial<NotificationRequestError>); }
  finally { globalThis.fetch = originalFetch; }
});

test("inbox actions use authenticated organization-scoped endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; credentials: RequestCredentials | undefined }> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", credentials: init?.credentials });
    return new Response(JSON.stringify({ items: [], unreadCount: 0 }), { status: 200 });
  }) as typeof fetch;
  try {
    await getInbox("org A");
    await markNotificationRead("org A", "id/1");
    await markAllNotificationsRead("org A");
    await dismissNotification("org A", "id/1");
    await dismissAllNotifications("org A");
    expect(calls).toEqual([
      { url: "/api/v1/organizations/org%20A/notifications", method: "GET", credentials: "include" },
      { url: "/api/v1/organizations/org%20A/notifications/id%2F1/read", method: "POST", credentials: "include" },
      { url: "/api/v1/organizations/org%20A/notifications/read-all", method: "POST", credentials: "include" },
      { url: "/api/v1/organizations/org%20A/notifications/id%2F1/dismiss", method: "POST", credentials: "include" },
      { url: "/api/v1/organizations/org%20A/notifications/dismiss-all", method: "POST", credentials: "include" },
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

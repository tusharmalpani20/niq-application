type PushConfig = { enabled: boolean; publicKey: string | null };
const base = (organizationId: string) => `/api/v1/organizations/${encodeURIComponent(organizationId)}/push`;

async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, credentials: "include", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "Push notifications could not be updated.");
  return data as T;
}

export function pushSupported() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushState(organizationId: string): Promise<"unavailable" | "unsupported" | "enabled" | "disabled"> {
  const config = await request<PushConfig>(`${base(organizationId)}/config`);
  if (!config.enabled || !config.publicKey) return "unavailable";
  if (!pushSupported()) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "disabled";
  const status = await request<{ enabled: boolean }>(`${base(organizationId)}/subscriptions/status`, "POST", { endpoint: subscription.endpoint });
  return status.enabled ? "enabled" : "disabled";
}

function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - key.length % 4) % 4));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export async function enablePush(organizationId: string): Promise<void> {
  if (!pushSupported()) throw new Error("Push notifications are unavailable on this device.");
  // Keep the permission request in the direct button gesture, before any network await.
  if (Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") throw new Error("Allow notifications in your browser settings to turn on push alerts.");
  const config = await request<PushConfig>(`${base(organizationId)}/config`);
  if (!config.enabled || !config.publicKey) throw new Error("Push notifications are unavailable on this device.");
  const registration = await navigator.serviceWorker.register("/niq-push-sw.js", { scope: "/" });
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) });
  await request(`${base(organizationId)}/subscriptions`, "POST", subscription.toJSON());
}

export async function disablePush(organizationId: string): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await request(`${base(organizationId)}/subscriptions`, "DELETE", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}

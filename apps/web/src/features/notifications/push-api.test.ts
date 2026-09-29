import { expect, test } from "bun:test";
import { getPushState } from "./push-api";

test("an existing device subscription is on only for its signed-in account", async () => {
  const globals = ["window", "navigator", "fetch"] as const;
  const previous = Object.fromEntries(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const calls: Array<{ url: string; body: string | undefined }> = [];
  let assignedToAccount = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true, PushManager: class {}, Notification: class {} } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ endpoint: "https://web.push.apple.com/example" }) } }) } } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string, init?: RequestInit) => {
    calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    return Response.json(url.endsWith("/config") ? { enabled: true, publicKey: "test" } : { enabled: assignedToAccount });
  } });
  try {
    expect(await getPushState("org")).toBe("disabled");
    assignedToAccount = true;
    expect(await getPushState("org")).toBe("enabled");
    expect(calls.filter(call => call.url.endsWith("/subscriptions/status"))).toEqual([
      { url: "/api/v1/organizations/org/push/subscriptions/status", body: '{"endpoint":"https://web.push.apple.com/example"}' },
      { url: "/api/v1/organizations/org/push/subscriptions/status", body: '{"endpoint":"https://web.push.apple.com/example"}' },
    ]);
  } finally {
    for (const key of globals) {
      const descriptor = previous[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});

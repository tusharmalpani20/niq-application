self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { /* Show a generic alert. */ }
  const href = typeof payload.href === "string" && /^\/assessments\/ASM-\d{6,10}$/.test(payload.href) ? payload.href : "/assessments";
  event.waitUntil(self.registration.showNotification(
    typeof payload.title === "string" ? payload.title : "NIQ update",
    { body: typeof payload.body === "string" ? payload.body : "An update is available in NIQ.", icon: "/niq-icon.svg", tag: href, data: { href } },
  ));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const href = event.notification.data?.href ?? "/assessments";
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.focus(); existing.navigate(href); }
    else await clients.openWindow(href);
  })());
});

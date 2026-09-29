import { Bell, Check, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Inbox } from "./notification-api";
import { dismissAllNotifications, dismissNotification, getInbox, markAllNotificationsRead, markNotificationRead, safeNotificationHref } from "./notification-api";
import { useWorkspaceEvents } from "./useWorkspaceEvents";
import { disablePush, enablePush, getPushState } from "./push-api";

export function NotificationBell({ organizationId, onNavigate }: { organizationId: string; onNavigate: (to: string) => void }) {
  useWorkspaceEvents(organizationId);
  const [inbox, setInbox] = useState<Inbox>({ items: [], unreadCount: 0 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushState, setPushState] = useState<"unavailable" | "unsupported" | "enabled" | "disabled">("unavailable");
  const [pushBusy, setPushBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const next = await getInbox(organizationId);
      if (sequence === requestSequence.current) { setInbox(next); setError(null); setLoading(false); }
    } catch (cause) {
      if (sequence === requestSequence.current) { setError(cause instanceof Error ? cause.message : "Notifications could not be loaded."); setLoading(false); }
    }
  }, [organizationId]);

  useEffect(() => {
    void reload();
    const onWorkspaceChange = (event: Event) => {
      const scope = (event as CustomEvent<{ scope?: string }>).detail?.scope;
      if (scope === "notification" || scope === "organization") void reload();
    };
    window.addEventListener("niq:workspace-change", onWorkspaceChange);
    return () => { requestSequence.current++; window.removeEventListener("niq:workspace-change", onWorkspaceChange); };
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    void getPushState(organizationId).then(setPushState).catch(() => setPushState("unavailable"));
    const onOutside = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => { document.removeEventListener("pointerdown", onOutside); document.removeEventListener("keydown", onEscape); };
  }, [open, organizationId]);

  async function togglePush() {
    if (pushBusy) return;
    setPushBusy(true); setError(null);
    try {
      if (pushState === "enabled") { await disablePush(organizationId); setPushState("disabled"); }
      else { await enablePush(organizationId); setPushState("enabled"); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Push notifications could not be changed."); }
    finally { setPushBusy(false); }
  }

  async function mutate(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try { await action(); await reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The notification could not be updated."); }
    finally { setBusy(false); }
  }

  async function openItem(id: string, href: string | null, readAt: string | null) {
    if (!readAt) await mutate(() => markNotificationRead(organizationId, id));
    if (href) { setOpen(false); onNavigate(href); }
  }

  return <div className="notification-bell relative shrink-0" ref={root}>
    <button ref={button} type="button" aria-label={`Notifications${inbox.unreadCount ? `, ${inbox.unreadCount} unread` : ""}`} aria-expanded={open} aria-controls="notification-inbox" className="relative grid size-9 place-items-center rounded-full text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => { setOpen((current) => !current); if (!open) void reload(); }}>
      <Bell className="size-[18px]" aria-hidden="true" />
      {inbox.unreadCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">{inbox.unreadCount > 99 ? "99+" : inbox.unreadCount}</span>}
    </button>
    {open && <section id="notification-inbox" aria-label="Notifications" className="absolute right-0 top-[calc(100%+.75rem)] z-50 flex max-h-[min(32rem,70svh)] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">Notifications</h2>
        <div className="flex items-center gap-2 text-xs">
          {inbox.unreadCount > 0 && <button type="button" disabled={busy} className="text-primary hover:underline disabled:opacity-50" onClick={() => void mutate(() => markAllNotificationsRead(organizationId))}>Mark all read</button>}
          {inbox.items.length > 0 && <button type="button" disabled={busy} className="text-muted-foreground hover:underline disabled:opacity-50" onClick={() => void mutate(() => dismissAllNotifications(organizationId))}>Clear all</button>}
        </div>
      </div>
      {pushState !== "unavailable" && <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
        {pushState === "unsupported" ? "Push alerts need a secure connection. On iPhone, add NIQ to your Home Screen and open it there." :
          <button type="button" disabled={pushBusy} className="text-primary hover:underline disabled:opacity-50" onClick={() => void togglePush()}>{pushBusy ? "Updating push alerts…" : pushState === "enabled" ? "Turn off push alerts on this device" : "Turn on push alerts on this device"}</button>}
      </div>}
      {error && <div role="alert" className="border-b border-border px-4 py-2 text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></div>}
      <div className="min-h-0 overflow-y-auto">
        {inbox.items.length === 0 && !error && <p className="px-4 py-8 text-center text-sm text-muted-foreground">{loading ? "Loading notifications…" : "No notifications yet."}</p>}
        {inbox.items.map((item) => {
          const href = safeNotificationHref(item.href);
          return <div key={item.id} className={`border-b border-border px-4 py-3 last:border-b-0 ${item.readAt ? "" : "bg-primary/5"}`}>
            <div className="flex items-start justify-between gap-2">
              <button type="button" disabled={busy || !href} className="min-w-0 flex-1 text-left disabled:cursor-default" onClick={() => void openItem(item.id, href, item.readAt)}>
                <span className="block text-sm font-semibold">{item.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{item.body}</span>
                <time className="mt-1 block text-xs text-muted-foreground" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
              </button>
              <div className="flex shrink-0 gap-1">
                {!item.readAt && <button type="button" disabled={busy} title="Mark as read" aria-label={`Mark ${item.title} as read`} className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50" onClick={() => void mutate(() => markNotificationRead(organizationId, item.id))}><Check size={16} /></button>}
                <button type="button" disabled={busy} title="Clear" aria-label={`Clear ${item.title}`} className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50" onClick={() => void mutate(() => dismissNotification(organizationId, item.id))}><Trash2 size={16} /></button>
              </div>
            </div>
          </div>;
        })}
      </div>
    </section>}
  </div>;
}

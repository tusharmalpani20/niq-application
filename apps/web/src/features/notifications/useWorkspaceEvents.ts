import { useEffect } from "react";

export type WorkspaceChange = {
  scope: "assessment" | "patient" | "facility" | "users" | "organization" | "notification";
  assessmentId?: string;
};

const scopes = new Set<WorkspaceChange["scope"]>(["assessment", "patient", "facility", "users", "organization", "notification"]);

export function useWorkspaceEvents(organizationId: string) {
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    const onChange = (event: MessageEvent) => {
      try {
        const detail: unknown = JSON.parse(event.data);
        if (!detail || typeof detail !== "object" || !("scope" in detail) || !scopes.has(detail.scope as WorkspaceChange["scope"])) return;
        window.dispatchEvent(new CustomEvent<WorkspaceChange>("niq:workspace-change", { detail: detail as WorkspaceChange }));
      } catch { /* Ignore malformed live events; a later reconnect refresh catches up. */ }
    };
    const catchUp = () => {
      if (document.visibilityState === "visible") window.dispatchEvent(new CustomEvent<WorkspaceChange>("niq:workspace-change", { detail: { scope: "organization" } }));
    };
    let connected = false;
    const onOpen = () => { if (connected) catchUp(); connected = true; };
    const connect = () => {
      if (source || document.visibilityState !== "visible") return;
      source = new EventSource(`/api/v1/organizations/${encodeURIComponent(organizationId)}/live`, { withCredentials: true });
      source.addEventListener("change", onChange);
      source.addEventListener("open", onOpen);
      catchUp();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") connect();
      else { source?.close(); source = null; }
    };
    connect();
    window.addEventListener("focus", catchUp);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", catchUp);
      document.removeEventListener("visibilitychange", onVisibility);
      source?.close();
    };
  }, [organizationId]);
}

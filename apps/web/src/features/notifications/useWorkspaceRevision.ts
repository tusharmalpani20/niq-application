import { useEffect, useState } from "react";
import type { WorkspaceChange } from "./useWorkspaceEvents";

/** A quiet invalidation signal; each screen keeps its current filters and position. */
export function useWorkspaceRevision(scopes: WorkspaceChange["scope"][]): number {
  const [revision, setRevision] = useState(0);
  const key = scopes.join(",");
  useEffect(() => {
    const accepted = new Set(key.split(","));
    const onChange = (event: Event) => {
      const change = (event as CustomEvent<WorkspaceChange>).detail;
      if (change?.scope === "organization" || accepted.has(change?.scope)) setRevision(value => value + 1);
    };
    window.addEventListener("niq:workspace-change", onChange);
    return () => window.removeEventListener("niq:workspace-change", onChange);
  }, [key]);
  return revision;
}

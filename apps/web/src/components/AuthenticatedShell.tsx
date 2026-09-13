import type { AuthenticatedUser } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ApiRequestError, getCurrentUser } from "../lib/api";
import { AppShell } from "./AppShell";
import { PlatformAdminShell } from "./PlatformAdminShell";

export function AuthenticatedShell({ area }: { area: "platform" | "organization" }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [state, setState] = useState<"loading" | "authenticated" | "unauthenticated" | "unavailable">("loading");

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((currentUser) => { if (active) { setUser(currentUser); setState("authenticated"); } })
      .catch((error) => {
        if (!active) return;
        setState(error instanceof ApiRequestError && error.response.error.code === "AUTHENTICATION_REQUIRED" ? "unauthenticated" : "unavailable");
      });
    return () => { active = false; };
  }, []);

  if (state === "unauthenticated") return <Navigate replace to="/sign-in" />;
  if (state === "unavailable") return <main className="auth-page"><section className="auth-card"><h1>Workspace unavailable</h1><p className="auth-intro">The application service could not be reached. Your data has not been changed.</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button></section></main>;
  if (state !== "authenticated" || !user) return <main className="auth-page"><div className="loading-state"><span className="spinner" /><span>Opening your secure workspace…</span></div></main>;
  if (area === "platform" && user.platformRole !== "NIQ_ADMIN") return <Navigate replace to="/" />;
  if (area === "organization" && user.platformRole === "NIQ_ADMIN") return <Navigate replace to="/admin/organizations" />;
  return area === "platform" ? <PlatformAdminShell user={user} /> : <AppShell user={user} />;
}

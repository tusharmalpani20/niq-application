import type { ReactNode } from "react";

export function AdminIllustratedHeader({ title, description, illustration }: { title: string; description: string; illustration: ReactNode }) {
  return <header className="mb-6 flex min-h-36 flex-col items-start justify-between gap-3 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/10 via-card to-card px-6 py-5 sm:flex-row sm:items-center sm:gap-4 sm:px-8">
    <div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Administration</p><h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{description}</p></div>
    <div className="h-20 w-40 shrink-0 self-end text-primary sm:h-28 sm:w-52">{illustration}</div>
  </header>;
}

export function AdministratorsIllustration() {
  return <svg className="h-full w-full" viewBox="0 0 208 112" fill="none" aria-hidden="true">
    <circle cx="113" cy="55" r="52" fill="currentColor" opacity=".08" />
    <circle cx="113" cy="55" r="39" stroke="currentColor" opacity=".16" />
    <rect x="29" y="28" width="82" height="70" rx="13" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    <circle cx="70" cy="52" r="11" fill="currentColor" opacity=".16" />
    <path d="M65 52a5 5 0 1 0 10 0 5 5 0 0 0-10 0Zm-7 19c1-7 5-11 12-11s11 4 12 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M52 82h36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".28" />
    <rect x="107" y="14" width="72" height="61" rx="12" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    <circle cx="143" cy="37" r="8" fill="currentColor" opacity=".16" />
    <path d="M139 37a4 4 0 1 0 8 0 4 4 0 0 0-8 0Zm-6 16c1-6 4-9 10-9s9 3 10 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M126 63h34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".28" />
    <circle cx="177" cy="83" r="16" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    <path d="m170 83 5 5 9-11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function OrganizationsIllustration() {
  return <svg className="h-full w-full" viewBox="0 0 208 112" fill="none" aria-hidden="true">
    <circle cx="105" cy="56" r="52" fill="currentColor" opacity=".08" />
    <circle cx="105" cy="56" r="39" stroke="currentColor" opacity=".16" />
    <path d="M30 94h150" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".25" />
    <rect x="27" y="48" width="42" height="46" rx="6" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    <rect x="69" y="26" width="70" height="68" rx="8" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    <rect x="139" y="44" width="42" height="50" rx="6" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    <path d="M42 64h12m-12 11h12m99-16h12m-12 11h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".45" />
    <path d="M88 45h12m10 0h12M88 58h12m10 0h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".5" />
    <path d="M95 94V78a9 9 0 0 1 18 0v16" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2" />
    <circle cx="35" cy="28" r="4" fill="currentColor" opacity=".32" /><circle cx="171" cy="22" r="3" fill="currentColor" opacity=".32" />
  </svg>;
}

export function InvitationEmptyIllustration() {
  return <svg className="empty-list-illustration" viewBox="0 0 280 164" fill="none" aria-hidden="true">
    <ellipse cx="140" cy="151" rx="94" ry="8" fill="currentColor" opacity=".07" />
    <circle cx="140" cy="78" r="72" fill="currentColor" opacity=".06" />
    <circle cx="140" cy="78" r="57" stroke="currentColor" opacity=".14" />
    <rect x="49" y="36" width="115" height="87" rx="15" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    <circle cx="106" cy="63" r="13" fill="currentColor" opacity=".16" />
    <path d="M101 62a5 5 0 1 0 10 0 5 5 0 0 0-10 0Zm-9 22c1-9 6-13 14-13s13 4 14 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M76 100h60" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".25" />
    <rect x="138" y="68" width="94" height="65" rx="12" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    <path d="m150 83 35 25 35-25m-70 37 26-19m44 19-26-19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="222" cy="46" r="15" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    <path d="M222 39v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="37" cy="90" r="3" fill="currentColor" opacity=".35" /><circle cx="241" cy="106" r="3" fill="currentColor" opacity=".35" />
  </svg>;
}

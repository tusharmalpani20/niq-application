import type { ReactNode } from "react";

function Artwork({ children }: { children: ReactNode }) {
  return <svg className="mx-auto h-auto w-32 text-primary" viewBox="0 0 160 104" fill="none" aria-hidden="true">
    <ellipse cx="80" cy="96" rx="54" ry="5" fill="currentColor" opacity=".08" />
    <circle cx="80" cy="49" r="45" fill="currentColor" opacity=".06" />
    <circle cx="80" cy="49" r="34" stroke="currentColor" opacity=".12" />
    {children}
  </svg>;
}

export function PriorityEmptyIllustration() {
  return <Artwork>
    <rect x="48" y="20" width="64" height="69" rx="10" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <path d="M62 65h36M62 74h27" stroke="var(--secondary)" strokeWidth="3" strokeLinecap="round" opacity=".45" />
    <path d="m80 30 4.4 9 9.9 1.4-7.1 6.9 1.7 9.8L80 52.5l-8.9 4.6 1.7-9.8-7.1-6.9 9.9-1.4L80 30Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </Artwork>;
}

export function ActivityEmptyIllustration() {
  return <Artwork>
    <rect x="43" y="25" width="74" height="61" rx="10" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <path d="M43 42h74M62 19v13m36-13v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M59 56h12m17 0h12M59 69h12m17 0h12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".3" />
  </Artwork>;
}

export function RecentPatientsEmptyIllustration() {
  return <Artwork>
    <rect x="39" y="25" width="82" height="62" rx="11" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <circle cx="65" cy="51" r="11" fill="currentColor" opacity=".12" />
    <circle cx="65" cy="48" r="5" stroke="currentColor" strokeWidth="2" />
    <path d="M54 65c1-6 5-9 11-9s10 3 11 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M88 47h20M88 59h15M52 75h56" stroke="var(--secondary)" strokeWidth="3" strokeLinecap="round" opacity=".45" />
  </Artwork>;
}

export function NutritionEmptyIllustration() {
  return <Artwork>
    <circle cx="80" cy="55" r="30" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    <circle cx="80" cy="55" r="20" stroke="currentColor" strokeWidth="2" opacity=".3" />
    <path d="M75 61c-9-12-4-19 8-20 2 10-1 16-8 20Zm0 0c4-8 8-12 15-15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M41 35v24m-6-24v13m12-13v13m-6 11v21m78-45v45" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Artwork>;
}

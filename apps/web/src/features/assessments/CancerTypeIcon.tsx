import type { ReactNode } from "react";

/** Schematic site cues for the workbook's cancer choices; labels carry the diagnosis. */
const drawings: Record<string, ReactNode> = {
  cancer_1: <><path d="M12 6c-2.2-3.5-6.5-2.4-6.5 1.2 0 2.7 2.5 5.4 6.5 9.3 4-3.9 6.5-6.6 6.5-9.3C18.5 3.6 14.2 2.5 12 6Z" /><path d="m12 16.5-4 4.5m4-4.5 4 4.5M9 10l6 6" /></>,
  cancer_2: <><path d="M12 3v9m0-4-3 3m3-3 3 3" /><path d="M9 11C6 8 4 10 4 14v3c0 3 2 4 5 3l2-3v-5m4-1c3-3 5-1 5 3v3c0 3-2 4-5 3l-2-3v-5" /></>,
  cancer_3: <><path d="M5 4v10c0 3 2 5 5 5h4c3 0 5-2 5-5V4" /><path d="M8 4v9c0 1.5 1 2.5 2.5 2.5h3c1.5 0 2.5-1 2.5-2.5V4M12 19v2" /></>,
  cancer_4: <><path d="M9 3v6c0 2 1 3 3 3h2c2 0 2-2 2-4V6c3 1 5 4 5 7 0 5-4 8-9 8-5 0-8-3-8-7 0-3 2-5 5-5" /><path d="M9 3H6" /></>,
  cancer_5: <><path d="M2 12c1-6 7-9 15-9h7c4 0 6 2.5 6 6 0 2.5-2 3.5-5 5-2.7 1.4-3.7 3.4-4.7 6.2-.8 2.4-3.4 3.3-5.3 1.8-1-.8-1.5-1.8-1.7-2.8-4.2.6-6.1 2.8-7.7 5.3C4.3 27.4 2 25.5 2 23Z" /><path d="M17 3v10c0 3.5-1.5 5.3-3.7 6.2M12 19.5v5.2a2.8 2.8 0 0 1-2.8 2.8c-1.6 0-2.5-1.2-2.5-2.5" /></>,
  cancer_6: <><path d="M2.5 12.5c2-2 4-2.7 6.3-2.3 2 .3 3.5 1.4 5.5.8 2.1-.6 4-2.7 6.9-2l.8 3c-2.4 1.6-4.3 2.6-6.4 2.3-2.2-.2-3.9.5-6.2 2.1-2 1.4-4 1.5-6.4 1.4Z" /><path d="M7 12.8c1.2-.4 2.5-.2 3.6.3m5.4-.9 2-.9" /></>,
  cancer_7: <><path d="M12 3a7 7 0 0 0-7 7c0 2.5 1 4.5 3 6v3l-3 2m7-18a7 7 0 0 1 7 7v1l2 3-2 1v2c0 1.2-1 2-2 2h-2v2" /><path d="M12 7c-2 0-3 1.5-3 3m1 4c1 .8 2 .8 3 0" /></>,
  cancer_8: <><path d="M3 12c3-3 5-3 9-1 4-2 6-2 9 1-3 3-6 5-9 5s-6-2-9-5Z" /><path d="M4 12h16" /></>,
  cancer_9: <><path d="M11 5c-3-3-7 0-6 3-3 1-3 5-1 6-1 4 3 6 6 4l2 2 2-2c3 2 7 0 6-4 2-1 2-5-1-6 1-3-3-6-6-3l-1 2Z" /><path d="M12 7v10M7 10l2 2-2 2m10-4-2 2 2 2" /></>,
  cancer_10: <><path d="M8 9c2 0 3 2 4 4 1-2 2-4 4-4M12 13v7" /><ellipse cx="5.5" cy="8" rx="2.5" ry="3" /><ellipse cx="18.5" cy="8" rx="2.5" ry="3" /><path d="M8 8h2m4 0h2" /></>,
  cancer_11: <><path d="M7 5v5c0 4 2 7 5 7s5-3 5-7V5M7 7H4m13 0h3M12 17v4" /><path d="M9 10c2 2 4 2 6 0" /></>,
  cancer_12: <><path d="M7 5v5c0 3 2 5 5 5s5-2 5-5V5M7 7H4m13 0h3M12 15v5" /><circle cx="12" cy="18" r="2" /></>,
  cancer_13: <><path d="M7 5h10v5c0 2-2 3-5 3s-5-1-5-3Z" /><path d="M12 13v3m-5 0c0-2 2-3 5-3s5 1 5 3c0 2-2 4-5 4s-5-2-5-4Z" /></>,
  cancer_14: <><path d="M12 4v6m-4 0 4-2 4 2" /><ellipse cx="7" cy="16" rx="3" ry="4" /><ellipse cx="17" cy="16" rx="3" ry="4" /></>,
  cancer_15: <><path d="M9 4C5 4 3 7 3 12s2 8 6 8c3 0 4-3 3-5-2-2-2-4 0-6 1-2 0-5-3-5Zm6 0c4 0 6 3 6 8s-2 8-6 8c-3 0-4-3-3-5 2-2 2-4 0-6-1-2 0-5 3-5Z" /></>,
  cancer_16: <><path d="M7 5v5m10-5v5M6 10c0-2 12-2 12 0v4c0 4-2 6-6 6s-6-2-6-6Z" /><path d="M9 13h6" /></>,
  cancer_17: <><path d="M5 7a2.5 2.5 0 1 1 3-3l9 9a2.5 2.5 0 1 1 3 3 2.5 2.5 0 1 1-3 3L8 10a2.5 2.5 0 1 1-3-3Z" /></>,
  cancer_18: <><path d="M3 7c3-2 5-2 8 0s5 2 10 0M3 12c3-2 5-2 8 0s5 2 10 0M3 17c3-2 5-2 8 0s5 2 10 0" /><path d="M7 5v4m10 6v4" /></>,
  cancer_19: <><path d="M12 3C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-11Z" /><circle cx="10" cy="13" r="1.4" /><circle cx="14.5" cy="16" r="1.4" /></>,
  cancer_20: <><circle cx="12" cy="5" r="2" /><circle cx="5" cy="17" r="2" /><circle cx="19" cy="17" r="2" /><path d="m11 7-5 8m7-8 5 8M7 17h10" /></>,
  cancer_21: <><path d="M5 7a2.5 2.5 0 1 1 3-3l9 9a2.5 2.5 0 1 1 3 3 2.5 2.5 0 1 1-3 3L8 10a2.5 2.5 0 1 1-3-3Z" /><circle cx="11" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="14" cy="15" r="1" fill="currentColor" stroke="none" /></>,
  cancer_22: <><path d="M3 7c2-1 4-1 6 0s4 1 6 0 4-1 6 0M3 12h18M3 18h18" /><path d="M3 7v11m18-11v11M7 12v6m5-11v5m5 0v6" /></>,
  cancer_other: <><circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></>,
  cancer_unknown: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1.2V14" /><circle cx="12" cy="17" r=".75" fill="currentColor" stroke="none" /></>,
};

export function CancerTypeIcon({ type }: { type: string }) {
  const drawing = drawings[type];
  if (!drawing) return null;
  return <svg data-cancer-icon={type} viewBox={type === "cancer_5" ? "0 0 32 32" : "0 0 24 24"} fill="none" stroke="currentColor" strokeWidth={type === "cancer_5" ? "2.5" : "1.9"} strokeLinecap="round" strokeLinejoin="round" className="size-6 shrink-0" aria-hidden="true">{drawing}</svg>;
}

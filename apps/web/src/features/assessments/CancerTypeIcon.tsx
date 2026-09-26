import type { ReactNode } from "react";

/** Schematic site cues for the workbook's cancer choices; labels carry the diagnosis. */
const drawings: Record<string, ReactNode> = {
  cancer_1: <><path d="M5 19V9a7 7 0 0 1 14 0v10" /><path d="M5 13c2-2 5-2 7 0 2-2 5-2 7 0" /><circle cx="9" cy="15" r="1" /><circle cx="15" cy="15" r="1" /></>,
  cancer_2: <><path d="M12 3v9m0-4-3 3m3-3 3 3" /><path d="M9 11C6 8 4 10 4 14v3c0 3 2 4 5 3l2-3v-5m4-1c3-3 5-1 5 3v3c0 3-2 4-5 3l-2-3v-5" /></>,
  cancer_3: <><path d="M6 4h12a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3h-2a3 3 0 0 1-6 0H7a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Z" /><path d="M8 8v6h8V8M12 14v5" /></>,
  cancer_4: <><path d="M9 3v6c0 2 1 3 3 3h2c2 0 2-2 2-4V6c3 1 5 4 5 7 0 5-4 8-9 8-5 0-8-3-8-7 0-3 2-5 5-5" /><path d="M9 3H6" /></>,
  cancer_5: <><path d="M3 8c4-4 12-5 18-2v6c-3 4-8 6-14 5L3 14Z" /><path d="M8 17v3m8-6 2 3" /></>,
  cancer_6: <><path d="M3 12c3-3 5-4 8-3 3 1 5 0 8-2l2 3c-2 3-5 5-8 4-3-1-5 0-8 3Z" /><path d="m8 12 2 1m5-2 2-1" /></>,
  cancer_7: <><path d="M7 8a5 5 0 0 1 10 0v4a5 5 0 0 1-10 0Z" /><path d="M9 17v2l-4 2m10-4v2l4 2M9 9h.01M15 9h.01" /></>,
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
  cancer_18: <><path d="M3 7c3-2 5-2 8 0s5 2 10 0M3 12c3-2 5-2 8 0s5 2 10 0M3 17c3-2 5-2 8 0s5 2 10 0" /></>,
  cancer_19: <><path d="M12 3C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-11Z" /><circle cx="10" cy="13" r="1.4" /><circle cx="14.5" cy="16" r="1.4" /></>,
  cancer_20: <><circle cx="12" cy="5" r="2" /><circle cx="5" cy="17" r="2" /><circle cx="19" cy="17" r="2" /><path d="m11 7-5 8m7-8 5 8M7 17h10" /></>,
  cancer_21: <><path d="M5 7a2.5 2.5 0 1 1 3-3l9 9a2.5 2.5 0 1 1 3 3 2.5 2.5 0 1 1-3 3L8 10a2.5 2.5 0 1 1-3-3Z" /><circle cx="11" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="14" cy="15" r="1" fill="currentColor" stroke="none" /></>,
  cancer_22: <><path d="M3 7h18M3 12h18M3 17h18" /><path d="M7 7v5m5 0v5m5-10v5" /></>,
  cancer_other: <><circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></>,
  cancer_unknown: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1.2V14" /><circle cx="12" cy="17" r=".75" fill="currentColor" stroke="none" /></>,
};

export function CancerTypeIcon({ type }: { type: string }) {
  const drawing = drawings[type];
  if (!drawing) return null;
  return <svg data-cancer-icon={type} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-6 shrink-0" aria-hidden="true">{drawing}</svg>;
}

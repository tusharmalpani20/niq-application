import type { ReactNode } from "react";

/** Schematic visual cues only; the option label carries the clinical meaning. */
const drawings: Record<string, ReactNode> = {
  stage_localized: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></>,
  stage_locally_advanced: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /><path d="M12 3v3m9 6h-3m-6 9v-3m-9-6h3" /></>,
  stage_metastatic: <><circle cx="9" cy="12" r="5" /><circle cx="9" cy="12" r="1.8" fill="currentColor" stroke="none" /><path d="m14 9 3-3m-1 0h1v1m-2 7 3 3m0-2v2h-2" /><circle cx="19" cy="5" r="1.5" /><circle cx="19" cy="19" r="1.5" /></>,
  brain: <><path d="M12 5a3.4 3.4 0 0 0-5.8 1.5A3.5 3.5 0 0 0 4 12a3.5 3.5 0 0 0 3.2 5.5A3.4 3.4 0 0 0 12 19a3.4 3.4 0 0 0 4.8-1.5A3.5 3.5 0 0 0 20 12a3.5 3.5 0 0 0-2.2-5.5A3.4 3.4 0 0 0 12 5Z" /><path d="M12 5v14M8 8c1 1 1 2 0 3m8-3c-1 1-1 2 0 3M7 15l2-1m8 1-2-1" /></>,
  liver: <><path d="M3 7c3-2 6-2 10-1l8 2c0 5-2 9-6 10-2 .5-4-.5-5-2-2 1-5 1-7-1V7Z" /><path d="M10 16c1-3 4-5 8-5" /></>,
  lung: <><path d="M12 3v9m0-5-3 3m3-3 3 3" /><path d="M9 10C6 8 4 10 4 14v3c0 3 2 4 5 3l2-3v-6m4-1c3-2 5 0 5 4v3c0 3-2 4-5 3l-2-3v-6" /></>,
  bone: <><path d="M5 7a2.5 2.5 0 1 1 3-3l9 9a2.5 2.5 0 1 1 3 3 2.5 2.5 0 1 1-3 3L8 10a2.5 2.5 0 1 1-3-3Z" /></>,
  others: <><circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></>,
};

export function DiseaseChoiceIcon({ type }: { type: string }) {
  const drawing = drawings[type];
  if (!drawing) return null;
  return <svg data-disease-choice-icon={type} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-6 shrink-0" aria-hidden="true">{drawing}</svg>;
}

import type { FaceScanSession } from "@niq/application-contracts";
export type ScanPosture = FaceScanSession["context"]["posture"];
export const scanPostureLabels: Record<ScanPosture, string> = {
  resting: "Resting", standing: "Standing", walking: "After walking", exercising: "After exercising",
};
export const scanPostureOptions = (["resting", "standing"] as const).map(id => ({ id, label: scanPostureLabels[id] }));

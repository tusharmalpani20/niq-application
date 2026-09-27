import { expect, test } from "bun:test";
import { hasUsableFaceScan, type FaceScanSession } from "./face-scan";

test("only completed scans with a usable scoring result satisfy required scanning", () => {
  const session = {
    state: "COMPLETED",
    failureCode: null,
    result: { wellnessScore: 70 },
    score: { status: "SCORED" },
  } as FaceScanSession;

  expect(hasUsableFaceScan(session)).toBe(true);
  expect(hasUsableFaceScan({ ...session, score: null })).toBe(false);
  expect(hasUsableFaceScan({ ...session, score: { status: "UNAVAILABLE" } })).toBe(false);
  expect(hasUsableFaceScan({ ...session, result: null })).toBe(false);
  expect(hasUsableFaceScan({ ...session, failureCode: "SCORE_MAPPING_UNAVAILABLE" })).toBe(false);
  expect(hasUsableFaceScan({ ...session, state: "PROCESSING" })).toBe(false);
});

import { expect, test } from "bun:test";
import { hasUsableFaceScan, isUnderOneYearOldForFaceScan, type FaceScanSession } from "./face-scan";

test("face scan age boundary uses the saved birth date", () => {
  const today = new Date("2026-10-06T12:00:00Z");
  expect(isUnderOneYearOldForFaceScan("2026-05-05", today)).toBe(true);
  expect(isUnderOneYearOldForFaceScan("2025-10-07", today)).toBe(true);
  expect(isUnderOneYearOldForFaceScan("2025-10-06", today)).toBe(false);
  expect(isUnderOneYearOldForFaceScan(null, today)).toBe(false);
});

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

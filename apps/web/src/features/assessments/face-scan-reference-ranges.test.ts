import { expect, test } from "bun:test";
import type { FaceScanSession } from "@niq/application-contracts";
import { assessFaceScanRange } from "./face-scan-reference-ranges";

const context: FaceScanSession["context"] = {
  dob: "1990-01-01", gender: "male", heightCm: 170, weightKg: 70,
  posture: "resting", employeeId: "operator",
};

test("blood pressure compares both values against the report ranges", () => {
  expect(assessFaceScanRange("bloodPressure", "124/79", context)).toMatchObject({ outside: true });
  expect(assessFaceScanRange("bloodPressure", "120/80", context)).toMatchObject({ outside: false });
  expect(assessFaceScanRange("bloodPressure", "90/60", context)).toMatchObject({ outside: false });
  expect(assessFaceScanRange("bloodPressure", "124/—", context)).toBeNull();
});

test("strict and inclusive boundaries retain their report meaning", () => {
  expect(assessFaceScanRange("heartRate", 60, context)).toMatchObject({ outside: false });
  expect(assessFaceScanRange("respiratoryRate", 21, context)).toMatchObject({ outside: true });
  expect(assessFaceScanRange("pnn50", 3, context)).toMatchObject({ outside: true });
  expect(assessFaceScanRange("hba1c", 5.7, context)).toMatchObject({ outside: true });
  expect(assessFaceScanRange("hba1c", "<5.7", context)).toBeNull();
});

test("context dependent ranges are used only when their context is known", () => {
  expect(assessFaceScanRange("vo2max", "39.98", context)).toMatchObject({ outside: true });
  expect(assessFaceScanRange("vo2max", "39.98", { ...context, gender: "female" })).toMatchObject({ outside: false });
  expect(assessFaceScanRange("heartUtilisation", 50, context)).toMatchObject({ outside: true });
  expect(assessFaceScanRange("heartUtilisation", 50, { ...context, posture: "walking" })).toBeNull();
  expect(assessFaceScanRange("wellnessScore", 85, context)).toBeNull();
});

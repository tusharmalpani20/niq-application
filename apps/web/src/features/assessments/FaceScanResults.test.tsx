import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { faceScanSessionSchema } from "@niq/application-contracts";
import { FaceScanResults } from "./FaceScanResults";

test("extended scan metrics survive application validation and render missing values honestly", () => {
  const session = faceScanSessionSchema.parse({id:"scan",state:"COMPLETED",context:{dob:"1990-01-01",gender:"male",heightCm:170,weightKg:70,posture:"resting",employeeId:"operator"},createdAt:"2026-09-22T00:00:00Z",updatedAt:"2026-09-22T00:00:00Z",completedAt:"2026-09-22T00:00:00Z",failureCode:null,score:null,result:{schemaVersion:1,providerScanId:"scan",wellnessScore:89,healthRiskScore:11,physiologicalScore:60,mentalWellbeingScore:77.78,vitals:{heartRate:72,oxygenSaturation:96,respiratoryRate:17,systolic:123,diastolic:80},additionalMetrics:{hba1c:"<5.7",sdnn:47.5,vo2max:"39.98",rmssd:null}}});
  expect(session.result?.additionalMetrics?.hba1c).toBe("<5.7");
  const html=renderToStaticMarkup(<FaceScanResults session={session}/>);
  for (const text of ["HbA1c","&lt;5.7","SDNN","47.5","39.98","Mental wellbeing score","available", "NIQ points from Vital IQ", "Date of birth at scan", "1990-01-01", "Gender at scan", "Male"]) expect(html).toContain(text);
  expect(html).not.toContain("beta");
  expect(html).not.toContain("Unavailable results");
  expect(html).toContain("1/11 available");
  expect(html).toContain("1/7 available");
  expect(html).not.toContain("Fat calorie value");
  expect(html).not.toContain("Carbohydrate calorie value");
  expect(html).toContain("3/5 available");
  expect(html).toContain('aria-label="Not available">—</dd>');
  expect(html).toContain("Normal range: 90–120/60–80 mmHg");
  expect(html).not.toContain("bg-warning-soft");
  expect(html).toContain("Normal range: 60–100 ms");
  expect(html).toContain("Normal range: ≥42.5 mL/kg/min (male)");
  expect(html).not.toContain("95–100%");
  expect(html.match(/1 outside range/g)).toHaveLength(2);
  session.score = { status: "SCORED", points: 3, wellnessPoints: 2, stressIndex: 4, stressBand: "average", stressPoints: 1 };
  const scoredHtml = renderToStaticMarkup(<FaceScanResults session={session}/>);
  expect(scoredHtml).toContain("NIQ points from Vital IQ</dt><dd class=\"mt-1 text-2xl font-semibold tabular-nums\">3");
  expect(scoredHtml).not.toContain("Overall Health Score 2 + stress (average) 1");
  delete session.result!.additionalMetrics;
  expect(()=>renderToStaticMarkup(<FaceScanResults session={session}/>)).not.toThrow();
});


test("historical measurements retain their original recording date and source assessment", () => {
  const session = faceScanSessionSchema.parse({ id: "reused", state: "COMPLETED", context: { dob: "1990-01-01", gender: "male", heightCm: 170, weightKg: 70, posture: "resting", employeeId: "operator" }, createdAt: "2026-10-23T00:00:00Z", updatedAt: "2026-10-23T00:00:00Z", completedAt: "2026-10-21T08:00:00Z", failureCode: null, score: null, result: { schemaVersion: 1, providerScanId: "source", wellnessScore: 80, healthRiskScore: 20, physiologicalScore: null, mentalWellbeingScore: null, vitals: { heartRate: 72, oxygenSaturation: 96, respiratoryRate: 17, systolic: 123, diastolic: 80 } }, historicalSource: { sessionId: "source", assessmentReference: "ASM-003545", capturedAt: "2026-10-21T08:00:00Z" } });
  const html = renderToStaticMarkup(<FaceScanResults session={session}/>);
  expect(html).toContain("Historical measurement");
  expect(html).toContain("Recorded ");
  expect(html).toContain("reused from ASM-003545");
  expect(html).not.toContain("Completed ·");
  expect(html).not.toContain("23/10/2026");
});

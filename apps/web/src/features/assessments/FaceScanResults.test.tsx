import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { faceScanSessionSchema } from "@niq/application-contracts";
import { FaceScanResults } from "./FaceScanResults";

test("extended scan metrics survive application validation and render missing values honestly", () => {
  const session = faceScanSessionSchema.parse({id:"scan",state:"COMPLETED",context:{dob:"1990-01-01",gender:"male",heightCm:170,weightKg:70,posture:"resting",employeeId:"operator"},createdAt:"2026-09-22T00:00:00Z",updatedAt:"2026-09-22T00:00:00Z",completedAt:"2026-09-22T00:00:00Z",failureCode:null,score:null,result:{schemaVersion:1,providerScanId:"scan",wellnessScore:89,healthRiskScore:11,physiologicalScore:60,mentalWellbeingScore:77.78,vitals:{heartRate:72,oxygenSaturation:96,respiratoryRate:17,systolic:123,diastolic:80},additionalMetrics:{hba1c:"<5.7",sdnn:47.5,vo2max:"39.98",rmssd:null}}});
  expect(session.result?.additionalMetrics?.hba1c).toBe("<5.7");
  const html=renderToStaticMarkup(<FaceScanResults session={session}/>);
  for (const text of ["HbA1c","&lt;5.7","SDNN","47.5","39.98","Mental wellbeing score","available", "Vital IQ score", "Date of birth at scan", "1990-01-01", "Gender at scan", "Male"]) expect(html).toContain(text);
  expect(html).not.toContain("beta");
  expect(html).not.toContain("Unavailable results");
  expect(html).toContain("1/11 available");
  expect(html).toContain("1/9 available");
  expect(html).toContain("3/5 available");
  expect(html).toContain('aria-label="Not available">—</dd>');
  expect(html).toContain("Normal range: 90–120/60–80 mmHg");
  expect(html).not.toContain("bg-warning-soft");
  expect(html).toContain("Normal range: 60–100 ms");
  expect(html).toContain("Normal range: ≥42.5 mL/kg/min (male)");
  expect(html).not.toContain("95–100%");
  expect(html.match(/1 outside range/g)).toHaveLength(2);
  delete session.result!.additionalMetrics;
  expect(()=>renderToStaticMarkup(<FaceScanResults session={session}/>)).not.toThrow();
});

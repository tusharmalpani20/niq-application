import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { faceScanSessionSchema } from "@niq/application-contracts";
import { FaceScanResults } from "./FaceScanResults";

test("extended scan metrics survive application validation and render missing values honestly", () => {
  const session = faceScanSessionSchema.parse({id:"scan",state:"COMPLETED",context:{dob:"1990-01-01",gender:"male",heightCm:170,weightKg:70,posture:"resting",employeeId:"operator"},createdAt:"2026-09-22T00:00:00Z",updatedAt:"2026-09-22T00:00:00Z",completedAt:"2026-09-22T00:00:00Z",failureCode:null,score:null,result:{schemaVersion:1,providerScanId:"scan",wellnessScore:89,healthRiskScore:11,physiologicalScore:60,mentalWellbeingScore:77.78,vitals:{heartRate:72,oxygenSaturation:96,respiratoryRate:17,systolic:123,diastolic:80},additionalMetrics:{hba1c:"<5.7",sdnn:47.5,vo2max:"39.98",rmssd:null}}});
  expect(session.result?.additionalMetrics?.hba1c).toBe("<5.7");
  const html=renderToStaticMarkup(<FaceScanResults session={session}/>);
  for (const text of ["HbA1c","&lt;5.7","SDNN","47.5","39.98","Mental wellbeing score","Unavailable results", "NIQ scan score"]) expect(html).toContain(text);
  expect(html).not.toContain("beta");
  delete session.result!.additionalMetrics;
  expect(()=>renderToStaticMarkup(<FaceScanResults session={session}/>)).not.toThrow();
});

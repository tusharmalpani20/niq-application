import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PatientForm } from "./PatientForm";

const facility = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FAX", name: "Central", code: "CTR", status: "INACTIVE" as const, timezone: "Asia/Kolkata", createdAt: new Date(), updatedAt: new Date() };
const patient = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", organizationId: facility.organizationId, reference: "PAT-2", displayName: "Patient Name", medicalRecordNumber: "MRN-2", homeFacility: { id: facility.id, name: facility.name }, dateOfBirth: "1999-03-20", gender: "MALE" as const, phone: "9012345678", email: "patient@example.com", createdAt: new Date(), updatedAt: new Date() };

test("patient edit prefills demographics, keeps current inactive facility and uses the shared day-first date field", () => {
  const html = renderToStaticMarkup(<PatientForm organizationId={facility.organizationId} facilities={[facility]} patient={patient} onCancel={() => {}} onSaved={() => {}} />);
  expect(html).toContain('value="Patient Name"');
  expect(html).toContain('value="MRN-2"');
  expect(html).toContain('value="20/03/1999"');
  expect(html).toContain('placeholder="dd/mm/yyyy"');
  expect(html).toContain('value="patient@example.com"');
  expect(html).toContain('inputMode="numeric"');
  expect(html).toContain('pattern="[0-9]*"');
  expect(html).toContain("Save changes");
  expect(html).not.toContain('type="date"');
  expect(html).not.toContain("Add an active facility");
});

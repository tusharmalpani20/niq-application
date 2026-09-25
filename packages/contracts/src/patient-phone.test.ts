import { expect, test } from "bun:test";
import { registerPatientSchema, updatePatientSchema } from "./index";
const patient = { name: "Patient", medicalRecordNumber: "MRN", homeFacilityId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", dateOfBirth: "2000-01-01", gender: "UNKNOWN" };
const { medicalRecordNumber: _, ...editablePatient } = patient;
for (const [name, schema, input] of [["registration", registerPatientSchema, patient], ["editing", updatePatientSchema, editablePatient]] as const) {
  test(`${name} rejects nonnumeric mobile numbers`, () => {
    for (const phone of ["fefefefe", "98765abc12", "123.45", "1e10", "+919876543210"]) expect(schema.safeParse({ ...input, phone }).success).toBe(false);
    expect(schema.parse({ ...input, phone: "0987654321" }).phone).toBe("0987654321");
  });
}
for (const [name, schema, input] of [["registration", registerPatientSchema, patient], ["editing", updatePatientSchema, editablePatient]] as const) {
  test(`${name} requires a nonempty mobile number`, () => {
    expect(schema.safeParse(input).success).toBe(false);
    expect(schema.safeParse({ ...input, phone: "" }).success).toBe(false);
    expect(schema.safeParse({ ...input, phone: "   " }).success).toBe(false);
    expect(schema.safeParse({ ...input, phone: null }).success).toBe(false);
  });
}

import { expect, test } from "bun:test";
import { registerPatientSchema, updatePatientSchema } from "./index";
const patient = { name: "Patient", medicalRecordNumber: "MRN", homeFacilityId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", dateOfBirth: "2000-01-01", gender: "UNKNOWN" };
for (const [name, schema] of [["registration", registerPatientSchema], ["editing", updatePatientSchema]] as const) {
  test(`${name} rejects nonnumeric mobile numbers`, () => {
    for (const phone of ["fefefefe", "98765abc12", "123.45", "1e10", "+919876543210"]) expect(schema.safeParse({ ...patient, phone }).success).toBe(false);
    expect(schema.parse({ ...patient, phone: "0987654321" }).phone).toBe("0987654321");
  });
}
for (const [name, schema] of [["registration", registerPatientSchema], ["editing", updatePatientSchema]] as const) {
  test(`${name} requires a nonempty mobile number`, () => {
    expect(schema.safeParse(patient).success).toBe(false);
    expect(schema.safeParse({ ...patient, phone: "" }).success).toBe(false);
    expect(schema.safeParse({ ...patient, phone: "   " }).success).toBe(false);
    expect(schema.safeParse({ ...patient, phone: null }).success).toBe(false);
  });
}

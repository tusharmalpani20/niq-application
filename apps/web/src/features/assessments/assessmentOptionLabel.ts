import type { FormField } from "@niq/application-contracts";

/** Explain clinical shorthand while keeping the option IDs used for scoring unchanged. */
export function assessmentOptionLabel(field: Pick<FormField, "id" | "options">, optionId: string): string {
  if (field.id === "gastrointestinal_symptoms" && optionId === "gastrointestinal_symptoms_dysphagia") {
    return "Difficulty swallowing (dysphagia)";
  }
  return field.options?.find(option => option.id === optionId)?.label ?? optionId;
}

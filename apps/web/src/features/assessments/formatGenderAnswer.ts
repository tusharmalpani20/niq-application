/** Keep the stored patient code intact while displaying it as a readable label. */
export function formatGenderAnswer(value: string): string {
  const labels: Record<string, string> = {
    FEMALE: "Female",
    MALE: "Male",
    OTHER: "Other",
    UNKNOWN: "Unknown",
  };
  return labels[value] ?? value;
}

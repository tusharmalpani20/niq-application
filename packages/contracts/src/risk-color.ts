const presetColors: Record<string, string> = {
  green: "#159f70", amber: "#d97706", red: "#dc3d50",
  neutral: "#64748b", blue: "#3b82f6", purple: "#8b5cf6",
};

/** Resolve the saved risk category color consistently in the app and PDF. */
export function riskColorHex(color: string | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : presetColors[color ?? ""] ?? presetColors.neutral!;
}

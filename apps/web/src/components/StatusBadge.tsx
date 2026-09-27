import { Badge } from "@/components/ui/badge";

const neutral = { color: "var(--foreground)", backgroundColor: "var(--surface-subtle)", borderColor: "var(--border)", accent: "var(--client-muted)" };
const brand = { color: "var(--status-brand-foreground)", backgroundColor: "var(--primary-soft)", borderColor: "color-mix(in srgb, var(--primary) 28%, var(--border))", accent: "var(--status-brand-foreground)" };
const review = { color: "var(--review-foreground)", backgroundColor: "var(--review-background)", borderColor: "color-mix(in srgb, var(--review-foreground) 24%, var(--border))", accent: "var(--review-foreground)" };
const warning = { color: "var(--warning)", backgroundColor: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 24%, var(--border))", accent: "var(--warning)" };
const danger = { color: "var(--danger)", backgroundColor: "var(--destructive-soft)", borderColor: "color-mix(in srgb, var(--danger) 24%, var(--border))", accent: "var(--danger)" };
const success = { color: "var(--success)", backgroundColor: "var(--success-soft)", borderColor: "var(--success-border)", accent: "var(--success)" };
const tones: Record<string, typeof neutral> = {
  "Ready to send": brand, "Ready for scoring": brand, Scored: brand,
  "Under review": review, "In review": review, "Reopened for corrections": review,
  "Awaiting reviewer": warning, "Pending scoring": warning, "Awaiting resubmission": warning,
  "Needs correction": danger, "Scoring unavailable": danger, "Returned for correction": danger, Deactivated: danger,
  Completed: success, Active: success,
};

export function StatusBadge({ status }: { status: string }) {
  const { accent, ...style } = tones[status] ?? neutral;
  return <Badge variant="outline" className="status-badge" data-status={status.toLowerCase().replaceAll(" ", "-")} style={style}><span className="status-dot" style={{ backgroundColor: accent }} />{status}</Badge>;
}

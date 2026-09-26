import { Badge } from "@/components/ui/badge";

const tones: Record<string, { color: string; backgroundColor: string }> = {
  Draft: { color: "var(--primary)", backgroundColor: "var(--primary-soft)" },
  "Ready for scoring": { color: "var(--warning)", backgroundColor: "var(--warning-soft)" },
  "Pending scoring": { color: "var(--warning)", backgroundColor: "var(--warning-soft)" },
  "Scoring unavailable": { color: "var(--destructive)", backgroundColor: "var(--destructive-soft)" },
  Scored: { color: "var(--review-foreground)", backgroundColor: "var(--review-background)" },
  "Under review": { color: "var(--review-foreground)", backgroundColor: "var(--review-background)" },
  Completed: { color: "var(--success)", backgroundColor: "var(--success-soft)" },
  Voided: { color: "var(--destructive)", backgroundColor: "var(--destructive-soft)" },
  "Awaiting reviewer": { color: "var(--primary)", backgroundColor: "var(--primary-soft)" },
  "In review": { color: "var(--review-foreground)", backgroundColor: "var(--review-background)" },
  "Returned for correction": { color: "var(--destructive)", backgroundColor: "var(--destructive-soft)" },
  "Reopened for corrections": { color: "var(--review-foreground)", backgroundColor: "var(--review-background)" },
  "Awaiting resubmission": { color: "var(--warning)", backgroundColor: "var(--warning-soft)" },
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className="status-badge" data-status={status.toLowerCase().replaceAll(" ", "-")} style={tones[status]}><span className="status-dot" />{status}</Badge>;
}

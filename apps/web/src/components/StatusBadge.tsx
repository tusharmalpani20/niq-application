import { Badge } from "@/components/ui/badge";

type StatusBadgeValue = "Draft" | "Ready for scoring" | "Pending scoring" | "Scoring unavailable" | "Scored" | "Under review" | "Completed" | "Voided" | "Registered" | "Active" | "Invited" | "Suspended" | "Deactivated" | "Closed";

export function StatusBadge({ status }: { status: StatusBadgeValue }) {
  return <Badge variant="outline" className="status-badge" data-status={status.toLowerCase().replaceAll(" ", "-")}><span className="status-dot" />{status}</Badge>;
}

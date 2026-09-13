import { Badge } from "@/components/ui/badge";
import type { AssessmentStatus } from "../lib/demo-data";

export function StatusBadge({ status }: { status: AssessmentStatus | "Active" | "Invited" | "Suspended" | "Closed" }) {
  return <Badge variant="outline" className="status-badge" data-status={status.toLowerCase().replaceAll(" ", "-")}><span className="status-dot" />{status}</Badge>;
}

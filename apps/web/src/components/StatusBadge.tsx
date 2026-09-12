import type { AssessmentStatus } from "../lib/demo-data";
export function StatusBadge({ status }: { status: AssessmentStatus | "Active" | "Invited" }) { return <span className="status-badge" data-status={status.toLowerCase().replaceAll(" ", "-")}><span className="status-dot" />{status}</span>; }

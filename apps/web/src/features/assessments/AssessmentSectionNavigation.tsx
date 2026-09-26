import { UserRound, ScanFace, Cross, Stethoscope, History, ClipboardList, HeartPulse, Utensils, FileText, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectPopover, SelectList, SelectItem } from "@/components/ui/select";
import type { AssessmentAnswerCoverage } from "@niq/application-contracts";

export const assessmentSectionIcons = { personal_details: UserRound, face_scan: ScanFace, disease_status: Cross, treatment: Stethoscope, health_history: History, clinical_gut_health: HeartPulse, dietary_details: Utensils, reports: FileText, review: ListChecks };
const shortLabels: Record<string, string> = { clinical_gut_health: "Clinical & gut", dietary_details: "Diet" };

export function AssessmentSectionNavigation({ tabs, selected, coverage, scores = {}, scanStatus = "Pending", attachmentCounts, disabled, onSelect }: {
  tabs: Array<{ id: string; title: string }>; selected: string; coverage: AssessmentAnswerCoverage;
  scores?: Record<string, string>; scanStatus?: string; attachmentCounts: { reports: number; files: number };
  disabled: boolean; onSelect: (id: string) => void;
}) {
  const reportCount = `${attachmentCounts.reports} ${attachmentCounts.reports === 1 ? "report" : "reports"}`;
  const fileCount = `${attachmentCounts.files} ${attachmentCounts.files === 1 ? "file" : "files"}`;
  const attachmentCountsToShow = [attachmentCounts.reports > 0 ? reportCount : null, attachmentCounts.files > 0 ? fileCount : null].filter((count): count is string => count !== null);
  const attachmentSummary = attachmentCountsToShow.join(" · ");
  const items = tabs.map(tab => {
    const completion = coverage.sections.find(item => item.id === tab.id);
    const progressLabel = completion?.percent != null ? scores[tab.id] ?? `${completion.percent}%` : null;
    const Icon = assessmentSectionIcons[tab.id as keyof typeof assessmentSectionIcons] ?? ClipboardList;
    return <Button key={tab.id} variant="ghost" aria-label={tab.id === "face_scan" ? `${tab.title}: ${scanStatus}` : tab.id === "reports" && attachmentSummary ? `${tab.title}: ${attachmentSummary}` : tab.title} className={`h-12 w-full justify-start gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm ${selected === tab.id ? "assessment-active-step text-brand-ink font-semibold" : "text-muted-foreground"}`} aria-current={selected === tab.id ? "step" : undefined} isDisabled={disabled} onPress={() => { onSelect(tab.id); }}><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{shortLabels[tab.id] ?? tab.title}</span>{tab.id === "reports" ? attachmentCountsToShow.length > 0 && <span className="flex shrink-0 flex-col items-end text-[11px] font-normal leading-3.5 tabular-nums">{attachmentCountsToShow.map(count => <span key={count}>{count}</span>)}</span> : tab.id === "face_scan" ? <span title={scanStatus} className="max-w-16 shrink-0 truncate text-[11px]">{scanStatus}</span> : progressLabel && <span title={scores[tab.id]} className="max-w-16 shrink-0 truncate text-[11px] tabular-nums">{progressLabel}</span>}</Button>;
  });
  return <nav aria-label="Assessment sections" className="min-w-0 rounded-tl-xl @min-[48rem]:border-r @min-[48rem]:border-border @min-[48rem]:bg-muted/20">
    <div className="px-4 pt-4 @min-[48rem]:hidden">
      <Select aria-label="Assessment section" className="w-full" selectedKey={selected} isDisabled={disabled} onSelectionChange={key => { if (key !== null) onSelect(String(key)); }}>
        <SelectTrigger className="min-h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectPopover className="flex max-h-[var(--available-height,20rem)] flex-col">
          <SelectList className="min-h-0 max-h-72">
            {tabs.map(tab => {
              const completion = coverage.sections.find(item => item.id === tab.id);
              const progressLabel = completion?.percent != null ? scores[tab.id] ?? `${completion.percent}%` : null;
              const Icon = assessmentSectionIcons[tab.id as keyof typeof assessmentSectionIcons] ?? ClipboardList;
              return <SelectItem key={tab.id} id={tab.id} textValue={tab.title} className="min-h-11">
                <Icon className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{shortLabels[tab.id] ?? tab.title}</span>
                {tab.id === "face_scan" ? <span className="text-xs text-muted-foreground">{scanStatus}</span> : tab.id === "reports" ? attachmentCountsToShow.length > 0 && <span className="flex flex-col items-end text-xs tabular-nums text-muted-foreground">{attachmentCountsToShow.map(count => <span key={count}>{count}</span>)}</span> : progressLabel && <span className="text-xs tabular-nums text-muted-foreground">{progressLabel}</span>}
              </SelectItem>;
            })}
          </SelectList>
        </SelectPopover>
      </Select>
    </div>
    <div className="sticky top-28 hidden gap-1 px-4 py-3 @min-[48rem]:grid">{items}</div>
  </nav>;
}

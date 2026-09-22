import { UserRound, ScanFace, ShieldPlus, Stethoscope, ClipboardList, HeartPulse, Utensils, Paperclip, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectPopover, SelectList, SelectItem } from "@/components/ui/select";
import type { AssessmentAnswerCoverage } from "@niq/application-contracts";

const icons = { personal_details: UserRound, face_scan: ScanFace, disease_status: ShieldPlus, treatment: Stethoscope, health_history: ClipboardList, clinical_gut_health: HeartPulse, dietary_details: Utensils, reports: Paperclip, review: ListChecks };
export function AssessmentSectionNavigation({ tabs, selected, coverage, scores = {}, scanStatus = "Pending", disabled, onSelect }: {
  tabs: Array<{ id: string; title: string }>; selected: string; coverage: AssessmentAnswerCoverage;
  scores?: Record<string, string>; scanStatus?: string;
  disabled: boolean; onSelect: (id: string) => void;
}) {
  const items = tabs.map(tab => {
    const completion = coverage.sections.find(item => item.id === tab.id);
    const Icon = icons[tab.id as keyof typeof icons] ?? ClipboardList;
    return <Button key={tab.id} variant="ghost" aria-label={tab.id === "face_scan" ? `${tab.title}: ${scanStatus}` : tab.title} className={`h-auto min-h-11 w-full justify-start gap-2.5 whitespace-normal rounded-lg px-3 py-2.5 text-left text-sm ${selected === tab.id ? "bg-primary/10 text-brand-ink font-semibold" : "text-muted-foreground"}`} aria-current={selected === tab.id ? "step" : undefined} isDisabled={disabled} onPress={() => { onSelect(tab.id); }}><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="flex-1">{tab.title}</span>{tab.id === "face_scan" ? <span className="text-[11px]">{scanStatus}</span> : completion?.percent !== null && completion?.percent !== undefined && <span className="text-[11px] tabular-nums">{scores[tab.id] ?? `${completion.percent}%`}</span>}</Button>;
  });
  return <nav aria-label="Assessment sections" className="min-w-0 rounded-tl-xl @min-[48rem]:border-r @min-[48rem]:border-border @min-[48rem]:bg-muted/20">
    <div className="px-4 pt-4 @min-[48rem]:hidden">
      <Select aria-label="Assessment section" className="w-full" selectedKey={selected} isDisabled={disabled} onSelectionChange={key => { if (key !== null) onSelect(String(key)); }}>
        <SelectTrigger className="min-h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectPopover className="flex max-h-[var(--available-height,20rem)] flex-col">
          <SelectList className="min-h-0 max-h-72">
            {tabs.map(tab => {
              const completion = coverage.sections.find(item => item.id === tab.id);
              const Icon = icons[tab.id as keyof typeof icons] ?? ClipboardList;
              return <SelectItem key={tab.id} id={tab.id} textValue={tab.title} className="min-h-11">
                <Icon className="size-4 shrink-0" aria-hidden="true" /><span className="flex-1">{tab.title}</span>
                {tab.id === "face_scan" ? <span className="text-xs text-muted-foreground">{scanStatus}</span> : completion?.percent != null && <span className="text-xs tabular-nums text-muted-foreground">{scores[tab.id] ?? `${completion.percent}%`}</span>}
              </SelectItem>;
            })}
          </SelectList>
        </SelectPopover>
      </Select>
    </div>
    <div className="sticky top-28 hidden gap-1 p-3 @min-[48rem]:grid">{items}</div>
  </nav>;
}

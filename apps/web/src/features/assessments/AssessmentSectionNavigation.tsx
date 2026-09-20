import { useState } from "react";
import { ChevronDown, UserRound, ScanFace, ShieldPlus, Stethoscope, ClipboardList, HeartPulse, Utensils, Paperclip, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AssessmentAnswerCoverage } from "@niq/application-contracts";

const icons = { personal_details: UserRound, face_scan: ScanFace, disease_status: ShieldPlus, treatment: Stethoscope, health_history: ClipboardList, clinical_gut_health: HeartPulse, dietary_details: Utensils, reports: Paperclip, review: ListChecks };
export function AssessmentSectionNavigation({ tabs, selected, coverage, disabled, onSelect }: {
  tabs: Array<{ id: string; title: string }>; selected: string; coverage: AssessmentAnswerCoverage;
  disabled: boolean; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = tabs.map(tab => {
    const completion = coverage.sections.find(item => item.id === tab.id);
    const Icon = icons[tab.id as keyof typeof icons] ?? ClipboardList;
    return <Button key={tab.id} variant="ghost" aria-label={tab.title} className={`h-auto min-h-11 w-full justify-start gap-2.5 whitespace-normal rounded-lg px-3 py-2.5 text-left text-sm ${selected === tab.id ? "bg-primary/10 text-brand-ink font-semibold" : "text-muted-foreground"}`} aria-current={selected === tab.id ? "step" : undefined} isDisabled={disabled} onPress={() => { setOpen(false); onSelect(tab.id); }}><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="flex-1">{tab.title}</span>{completion?.percent !== null && completion?.percent !== undefined && <span className="text-[11px] tabular-nums">{completion.percent}%</span>}</Button>;
  });
  return <nav aria-label="Assessment sections" className="min-w-0 @min-[48rem]:border-r @min-[48rem]:border-border @min-[48rem]:bg-muted/20">
    <div className="px-4 pt-4 @min-[48rem]:hidden"><SheetTrigger isOpen={open} onOpenChange={setOpen}><Button variant="outline" className="h-11 w-full justify-between" isDisabled={disabled}>{tabs.find(tab => tab.id === selected)?.title}<ChevronDown aria-hidden="true" /></Button><Sheet side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" ariaLabel="Assessment sections"><SheetTitle>Assessment sections</SheetTitle><div className="mt-3 grid gap-1">{items}</div></Sheet></SheetTrigger></div>
    <div className="sticky top-28 hidden gap-1 p-3 @min-[48rem]:grid">{items}</div>
  </nav>;
}

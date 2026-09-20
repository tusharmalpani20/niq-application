import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AssessmentCompletion } from "@niq/application-contracts";

export function AssessmentSectionNavigation({ tabs, selected, progress, disabled, onSelect }: {
  tabs: Array<{ id: string; title: string }>; selected: string; progress: AssessmentCompletion;
  disabled: boolean; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = tabs.map(tab => {
    const completion = progress.sections.find(item => item.id === tab.id)?.percent;
    return <Button key={tab.id} variant={selected === tab.id ? "secondary" : "ghost"} className={`h-auto min-h-11 justify-between whitespace-normal px-3 py-2 text-left ${selected === tab.id ? "text-primary" : ""}`} aria-current={selected === tab.id ? "step" : undefined} isDisabled={disabled} onPress={() => { setOpen(false); onSelect(tab.id); }}><span>{tab.title}</span>{completion !== null && completion !== undefined && <span className="ml-2 text-xs">{completion}%</span>}</Button>;
  });
  return <nav aria-label="Assessment sections" className="min-w-0"><div className="lg:hidden"><SheetTrigger isOpen={open} onOpenChange={setOpen}><Button variant="outline" className="h-11 w-full justify-between" isDisabled={disabled}>{tabs.find(tab => tab.id === selected)?.title}<ChevronDown aria-hidden="true" /></Button><Sheet side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" ariaLabel="Assessment sections"><SheetTitle>Assessment sections</SheetTitle><div className="grid gap-1">{items}</div></Sheet></SheetTrigger></div><div className="hidden gap-1 lg:grid">{items}</div></nav>;
}

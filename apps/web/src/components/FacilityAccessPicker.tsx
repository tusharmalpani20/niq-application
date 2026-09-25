import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchCombobox } from "@/components/ui/combobox";

type FacilityOption = { id: string; name: string; status?: "ACTIVE" | "INACTIVE" };

export function FacilityAccessPicker({ idPrefix, facilities, selectedIds, allSelected, allowAll, disabled, invalid = false, errorId, onSelectedIdsChange, onAllChange }: {
  idPrefix: string;
  facilities: FacilityOption[];
  selectedIds: string[];
  allSelected: boolean;
  allowAll: boolean;
  disabled: boolean;
  invalid?: boolean;
  errorId?: string;
  onSelectedIdsChange: (ids: string[]) => void;
  onAllChange: (selected: boolean) => void;
}) {
  const available = facilities.filter(facility => allSelected || !selectedIds.includes(facility.id));
  const label = (facility: FacilityOption) => `${facility.name}${facility.status === "INACTIVE" ? " (inactive)" : ""}`;
  return <div role="group" aria-label="Facility access" className="space-y-3">
    {(allowAll || allSelected) && <div className="flex items-center gap-3"><Checkbox id={`${idPrefix}-all-facilities`} aria-label="All facilities" isSelected={allSelected} isDisabled={disabled || !allowAll} onChange={selected => { if (selected) onSelectedIdsChange([]); onAllChange(selected); }} /><label htmlFor={`${idPrefix}-all-facilities`}>All facilities</label></div>}
    {!allSelected && selectedIds.length > 0 && <div role="group" className="flex flex-wrap gap-2" aria-label="Selected facilities">{selectedIds.map(id => {
        const facility = facilities.find(item => item.id === id);
        if (!facility) return null;
        return <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 pl-3 text-sm"><span className="break-words">{label(facility)}</span><Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Remove ${facility.name}`} isDisabled={disabled} onPress={() => onSelectedIdsChange(selectedIds.filter(item => item !== id))}><X className="size-3.5" aria-hidden="true" /></Button></span>;
      })}</div>}
    <SearchCombobox key={`${allSelected}-${selectedIds.join(",")}`} id={`${idPrefix}-facility-search`} label="Add facility" placeholder="Search and add facilities…" options={available.map(facility => ({ id: facility.id, label: label(facility) }))} value={null} disabled={disabled || available.length === 0} invalid={invalid} describedBy={errorId} onChange={id => { if (allSelected) onAllChange(false); onSelectedIdsChange(allSelected ? [id] : [...selectedIds, id]); }} />
    {!allSelected && !selectedIds.length && !invalid && <p className="text-sm text-muted-foreground">Select at least one facility.</p>}
  </div>;
}

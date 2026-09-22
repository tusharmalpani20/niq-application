import { CalendarDays } from "lucide-react";
import { Input } from "../../components/ui/input";

export function displayAssessmentDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
export function storeAssessmentDate(value: string): string | null {
  if (!value.trim()) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

/** Keep ISO storage and the native calendar while making typed dates locale-independent. */
export function AssessmentDateInput({ id, label, value, disabled, required, invalid, describedBy, onChange }: {
  id: string; label: string; value: string; disabled: boolean; required?: boolean;
  invalid: boolean; describedBy?: string; onChange: (value: string | null) => void;
}) {
  return <div className="relative">
    <Input id={id} className="min-h-11 bg-background pr-12" type="text" placeholder="dd/mm/yyyy" maxLength={10} value={displayAssessmentDate(value)} disabled={disabled} aria-required={required} aria-invalid={invalid} aria-describedby={describedBy} onChange={event => onChange(storeAssessmentDate(event.target.value))} />
    <span className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg focus-within:ring-2 focus-within:ring-ring">
      <CalendarDays aria-hidden="true" className="pointer-events-none size-4" />
      <input type="date" aria-label={`Choose ${label.toLowerCase()} from calendar`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" disabled={disabled} value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""} onClick={event => { event.currentTarget.showPicker?.(); }} onChange={event => onChange(event.target.value || null)} />
    </span>
  </div>;
}

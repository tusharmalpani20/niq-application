import { DateCalendar } from "../../components/ui/date-calendar";
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

/** Keep ISO storage and a themed calendar while making typed dates locale-independent. */
export function AssessmentDateInput({ id, label, value, disabled, required, invalid, describedBy, onChange }: {
  id: string; label: string; value: string; disabled: boolean; required?: boolean;
  invalid: boolean; describedBy?: string; onChange: (value: string | null) => void;
}) {
  return <div className="relative">
    <Input id={id} className="min-h-11 bg-background pr-12" type="text" placeholder="dd/mm/yyyy" maxLength={10} value={displayAssessmentDate(value)} disabled={disabled} aria-required={required} aria-invalid={invalid} aria-describedby={describedBy} onChange={event => onChange(storeAssessmentDate(event.target.value))} />
    <DateCalendar value={value} label={label} disabled={disabled} onChange={onChange} />
  </div>;
}

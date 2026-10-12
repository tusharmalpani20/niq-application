import { useId } from "react";
import type { ReportToxicityOption } from "./clinical-review-api";

type Props = {
  options: ReportToxicityOption[];
  selectedIds: string[];
  loading: boolean;
  error: string;
  disabled: boolean;
  onToggle: (id: string, selected: boolean) => void;
  onRetry: () => void;
};

function readableId(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function ReportToxicityPicker({ options, selectedIds, loading, error, disabled, onToggle, onRetry }: Props) {
  const headingId = useId();
  const unavailableCount = selectedIds.filter(id => !options.some(option => option.id === id)).length;
  const groups = new Map<string, { label: string; options: ReportToxicityOption[] }>();
  for (const option of options) {
    const key = `${option.treatmentTypeId}:${option.classId}`;
    const group = groups.get(key) ?? {
      label: `${option.treatmentTypeLabel || readableId(option.treatmentTypeId)} · ${option.classLabel || readableId(option.classId)}`,
      options: [],
    };
    group.options.push(option);
    groups.set(key, group);
  }

  return <section className="cr-toxicity-picker" aria-labelledby={headingId}>
    <h3 id={headingId}>Additional treatment effects</h3>
    {!loading && !error && groups.size > 0 && <p>Assessment answers are matched to guidance automatically. Add an effect only if you have confirmed it for this patient.</p>}
    {loading ? <p role="status">Loading effects available for this treatment…</p> : error ?
      <div className="cr-toxicity-picker-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></div> :
      <>{unavailableCount > 0 && <p className="cr-toxicity-picker-warning" role="alert">{unavailableCount} previously selected {unavailableCount === 1 ? "effect is" : "effects are"} no longer available for this assessment and will be omitted.</p>}
      {groups.size ? <div className="cr-toxicity-picker-list">
        {[...groups].map(([key, group]) => <fieldset key={key} disabled={disabled}>
          <legend>{group.label}</legend>
          {group.options.map(option => <label key={option.id}>
            <input type="checkbox" checked={selectedIds.includes(option.id)} onChange={event => onToggle(option.id, event.target.checked)}/>
            <span>{option.expectedToxicity}</span>
          </label>)}
        </fieldset>)}
      </div> : <p className="cr-toxicity-picker-empty">There are no additional effects to select for this treatment and drug class. This does not mean the patient has no side effects.</p>}</>}
  </section>;
}

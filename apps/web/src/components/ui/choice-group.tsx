import { Check } from "lucide-react";
import { Checkbox, Radio } from "react-aria-components";
import { RadioGroup } from "./radio-group";
import type { ComboboxOption } from "./combobox";
import type { ReactNode } from "react";

/** Compact radio choices share the central theme without browser-native menu styling. */
export function ChoiceGroup({ id, label, options, value, onChange, disabled, required, invalid, describedBy }: {
  id: string; label: string; options: ComboboxOption[]; value: string; onChange: (value: string) => void;
  disabled?: boolean; required?: boolean; invalid?: boolean; describedBy?: string;
}) {
  return <div id={id} tabIndex={-1}><p className="mb-2 text-sm text-muted-foreground">Select one</p><RadioGroup aria-label={label} aria-describedby={describedBy} value={value} onChange={onChange} isDisabled={disabled} isRequired={required} isInvalid={invalid} className="flex flex-wrap gap-2">
    {options.map(option => <Radio key={option.id} value={option.id} className="assessment-choice flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-border px-4 py-2.5 text-base outline-none data-selected:border-primary data-selected:bg-primary/5 data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:opacity-60">
      {({ isSelected }) => <><span className={`flex size-5 shrink-0 items-center justify-center rounded-full border border-current text-brand-ink ${isSelected ? "assessment-selected-indicator" : ""}`} aria-hidden="true">{isSelected && <span className="size-2.5 rounded-full bg-current" />}</span>{option.label}</>}
    </Radio>)}
  </RadioGroup></div>;
}

/** Short multi-select lists stay visible so every choice is discoverable. */
export function MultipleChoiceGroup({ label, options, value, onChange, disabled, renderIcon, iconTiles = false }: {
  label: string; options: ComboboxOption[]; value: string[]; onChange: (value: string[]) => void; disabled?: boolean; renderIcon?: (optionId: string) => ReactNode; iconTiles?: boolean;
}) {
  return <div role="group" aria-label={label}><p className="mb-2 text-sm text-muted-foreground">Select all that apply</p><div className="flex flex-wrap gap-2">{options.map(option => <Checkbox key={option.id} isSelected={value.includes(option.id)} isDisabled={disabled} onChange={selected => onChange(selected ? [...value, option.id] : value.filter(id => id !== option.id))} style={iconTiles && value.includes(option.id) ? { backgroundColor: "color-mix(in srgb, var(--primary) 14%, var(--card))" } : undefined} className="assessment-choice flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-border px-4 py-2.5 text-base outline-none data-selected:border-primary data-selected:bg-primary/5 data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:opacity-60">
    {({ isSelected }) => <>{iconTiles ? <span aria-hidden="true" style={isSelected ? { backgroundColor: "color-mix(in srgb, var(--primary) 75%, black)" } : undefined} className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors ${isSelected ? "assessment-selected-indicator text-primary-foreground ring-2 ring-primary/25" : "bg-primary/10 text-primary/70"}`}>{renderIcon?.(option.id)}</span> : <><span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded border ${isSelected ? "assessment-selected-indicator border-primary bg-primary text-primary-foreground" : "border-current text-brand-ink"}`}>{isSelected && <Check className="size-4" strokeWidth={3} />}</span>{renderIcon?.(option.id)}</>}{option.label}</>}
  </Checkbox>)}</div></div>;
}

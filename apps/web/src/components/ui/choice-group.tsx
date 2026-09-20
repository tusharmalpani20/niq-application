import { Checkbox, Radio } from "react-aria-components";
import { RadioGroup } from "./radio-group";
import type { ComboboxOption } from "./combobox";

/** Compact radio choices share the central theme without browser-native menu styling. */
export function ChoiceGroup({ id, label, options, value, onChange, disabled, required, invalid, describedBy }: {
  id: string; label: string; options: ComboboxOption[]; value: string; onChange: (value: string) => void;
  disabled?: boolean; required?: boolean; invalid?: boolean; describedBy?: string;
}) {
  return <div id={id} tabIndex={-1}><RadioGroup aria-label={label} aria-describedby={describedBy} value={value} onChange={onChange} isDisabled={disabled} isRequired={required} isInvalid={invalid} className="flex flex-wrap gap-2">
    {options.map(option => <Radio key={option.id} value={option.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm outline-none data-selected:border-primary data-selected:bg-primary/5 data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:opacity-60">
      {({ isSelected }) => <><span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-current text-brand-ink" aria-hidden="true">{isSelected && <span className="size-2 rounded-full bg-current" />}</span>{option.label}</>}
    </Radio>)}
  </RadioGroup></div>;
}

/** Short multi-select lists stay visible so every choice is discoverable. */
export function MultipleChoiceGroup({ label, options, value, onChange, disabled }: {
  label: string; options: ComboboxOption[]; value: string[]; onChange: (value: string[]) => void; disabled?: boolean;
}) {
  return <div role="group" aria-label={label} className="flex flex-wrap gap-2">{options.map(option => <Checkbox key={option.id} isSelected={value.includes(option.id)} isDisabled={disabled} onChange={selected => onChange(selected ? [...value, option.id] : value.filter(id => id !== option.id))} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm outline-none data-selected:border-primary data-selected:bg-primary/5 data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:opacity-60">
    {({ isSelected }) => <><span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center rounded border border-current text-brand-ink">{isSelected && <span className="size-2 rounded-sm bg-current" />}</span>{option.label}</>}
  </Checkbox>)}</div>;
}

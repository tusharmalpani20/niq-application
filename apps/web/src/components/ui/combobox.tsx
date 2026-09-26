import { useEffect, useState, type ReactNode } from "react";
import { ComboBox, ComboBoxStateContext, Group, ListBox, ListBoxItem, Popover } from "react-aria-components";
import { Check, ChevronsUpDown } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";

/** Ignore casing and optional separators when searching names and references. */
export function matchesComboboxSearch(label: string, query: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{Dash_Punctuation}]+/gu, "");
  return normalize(label).includes(normalize(query));
}

export type ComboboxOption = { id: string; label: string };
export type SearchComboboxProps = {
  id?: string; label: string; options: ComboboxOption[]; value: string | null;
  onChange: (value: string) => void; disabled?: boolean; required?: boolean;
  invalid?: boolean; describedBy?: string; placeholder?: string;
  customValue?: string; onCreate?: (text: string) => void; large?: boolean;
  renderIcon?: (optionId: string) => ReactNode; primaryHighlight?: boolean;
};
/** One themed, keyboard-operable search menu; custom values require an explicit Use action. */
export function SearchCombobox({ id, label, options, value, onChange, disabled, required, invalid, describedBy, placeholder = "Search or select…", customValue, onCreate, large = false, renderIcon, primaryHighlight = false }: SearchComboboxProps) {
  const selectedLabel = options.find(option => option.id === value)?.label || "";
  const [search, setSearch] = useState(selectedLabel);
  useEffect(() => setSearch(selectedLabel), [selectedLabel, value]);
  const query = search.trim();
  const matches = options.filter(option => matchesComboboxSearch(option.label, query));
  const canCreate = Boolean(onCreate && query && !options.some(option => option.label.toLocaleLowerCase() === query.toLocaleLowerCase()) && query !== customValue);
  const items = [...(search === selectedLabel ? options : matches), ...(canCreate ? [{ id: "__custom__", label: `Use “${query}” as Other` }] : [])];
  const selectedIcon = renderIcon && value && search === selectedLabel ? renderIcon(value) : null;
  return <ComboBox data-slot="search-combobox" aria-label={label} isDisabled={disabled} isRequired={required} isInvalid={invalid} allowsCustomValue allowsEmptyCollection menuTrigger="manual"
    selectedKey={value} inputValue={search} onInputChange={setSearch} items={items}
    onSelectionChange={key => { if (key === null) return; if (key === "__custom__") { onCreate?.(query); setSearch(selectedLabel); } else { onChange(String(key)); setSearch(options.find(option => option.id === key)?.label || ""); } }}
    onBlur={() => setSearch(selectedLabel)} className="w-full min-w-0">
    <ComboBoxStateContext.Consumer>{state => <>
    <Group className={`flex items-center rounded-lg border border-input bg-background ${primaryHighlight ? "focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-1 focus-within:ring-primary" : "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"} ${large ? "min-h-12" : "min-h-11"}`}>
      {selectedIcon && <span className={`ml-2.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${primaryHighlight ? "bg-primary text-primary-foreground shadow-sm" : "bg-primary/10 text-brand-ink"}`} aria-hidden="true">{selectedIcon}</span>}
      <Input onClick={() => state?.open()} onInput={() => state?.open()} id={id} aria-describedby={describedBy} maxLength={2000} placeholder={placeholder} onKeyDown={event => {
        // React Aria commits a highlighted option itself. Enter without one is
        // also an explicit acceptance of the visible custom-answer action.
        if (event.key === "Enter" && !event.nativeEvent.isComposing && canCreate && !event.currentTarget.getAttribute("aria-activedescendant")) {
          event.preventDefault();
          event.stopPropagation();
          state?.setSelectedKey("__custom__");
          state?.close();
        }
      }} className={`${large ? "h-12 md:text-base" : "h-11"} border-0 bg-transparent shadow-none focus-visible:ring-0`} />
      <Button variant="ghost" size="icon" className="mr-1 size-10" aria-label={`Show ${label} options`}><ChevronsUpDown className="size-4" /></Button>
    </Group>
    <Popover placement="bottom start" offset={4} className="z-50 flex max-h-[var(--available-height,18rem)] flex-col w-(--trigger-width) max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
      <ListBox<ComboboxOption> className="themed-scrollbar min-h-0 max-h-72 overflow-y-auto overscroll-contain p-1.5 outline-none" renderEmptyState={() => <p className="p-3 text-sm text-muted-foreground">No matching options</p>}>
        {option => {
          const icon = renderIcon?.(option.id);
          return <ListBoxItem id={option.id} textValue={option.label} className={({ isSelected, isFocused, isHovered }) => `flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 outline-none data-selected:font-medium ${primaryHighlight ? isSelected || isFocused || isHovered ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary" : "border-transparent" : "border-transparent data-focused:bg-accent data-focused:text-accent-foreground"} ${large ? "min-h-12 text-base" : "min-h-11 text-sm"}`}>
            {({ isSelected, isFocused, isHovered }) => <><span className="flex min-w-0 items-center gap-3">{icon && <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors ${primaryHighlight ? isSelected || isFocused || isHovered ? "bg-primary text-primary-foreground shadow-sm" : "bg-primary/10 text-primary/70" : "bg-primary/10 text-brand-ink"}`} aria-hidden="true">{icon}</span>}<span className="break-words">{option.label}</span></span>{isSelected && !primaryHighlight && <Check className="size-4 shrink-0" />}</>}
          </ListBoxItem>;
        }}
      </ListBox>
    </Popover>
    </>}</ComboBoxStateContext.Consumer>
  </ComboBox>;
}

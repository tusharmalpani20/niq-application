import { useEffect, useState } from "react";
import { ComboBox, ComboBoxStateContext, ListBox, ListBoxItem, Popover } from "react-aria-components";
import { Check, ChevronsUpDown } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";

export type ComboboxOption = { id: string; label: string };
export type SearchComboboxProps = {
  id?: string; label: string; options: ComboboxOption[]; value: string | null;
  onChange: (value: string) => void; disabled?: boolean; required?: boolean;
  invalid?: boolean; describedBy?: string; placeholder?: string;
  customValue?: string; onCreate?: (text: string) => void;
};
/** One themed, keyboard-operable search menu; custom values require an explicit Use action. */
export function SearchCombobox({ id, label, options, value, onChange, disabled, required, invalid, describedBy, placeholder = "Search or select…", customValue, onCreate }: SearchComboboxProps) {
  const selectedLabel = options.find(option => option.id === value)?.label || "";
  const [search, setSearch] = useState(selectedLabel);
  useEffect(() => setSearch(selectedLabel), [selectedLabel, value]);
  const query = search.trim();
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const canCreate = Boolean(onCreate && query && !options.some(option => option.label.toLocaleLowerCase() === query.toLocaleLowerCase()) && query !== customValue);
  const items = [...(search === selectedLabel ? options : matches), ...(canCreate ? [{ id: "__custom__", label: `Use “${query}” as Other` }] : [])];
  return <ComboBox aria-label={label} isDisabled={disabled} isRequired={required} isInvalid={invalid} allowsCustomValue allowsEmptyCollection menuTrigger="manual"
    selectedKey={value} inputValue={search} onInputChange={setSearch} items={items}
    onSelectionChange={key => { if (key === null) return; if (key === "__custom__") { onCreate?.(query); setSearch(selectedLabel); } else { onChange(String(key)); setSearch(options.find(option => option.id === key)?.label || ""); } }}
    onBlur={() => setSearch(selectedLabel)} className="w-full min-w-0">
    <ComboBoxStateContext.Consumer>{state => <>
    <div className="flex min-h-11 items-center rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
      <Input onInput={() => state?.open()} id={id} aria-describedby={describedBy} maxLength={2000} placeholder={placeholder} onKeyDown={event => {
        // React Aria commits a highlighted option itself. Enter without one is
        // also an explicit acceptance of the visible custom-answer action.
        if (event.key === "Enter" && !event.nativeEvent.isComposing && canCreate && !event.currentTarget.getAttribute("aria-activedescendant")) {
          event.preventDefault();
          event.stopPropagation();
          state?.setSelectedKey("__custom__");
          state?.close();
        }
      }} className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0" />
      <Button variant="ghost" size="icon" className="mr-1 size-10" aria-label={`Show ${label} options`}><ChevronsUpDown className="size-4" /></Button>
    </div>
    <Popover placement="bottom start" offset={4} className="z-50 flex max-h-[var(--available-height,18rem)] flex-col w-(--trigger-width) max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
      <ListBox<ComboboxOption> className="min-h-0 max-h-72 overflow-y-scroll overscroll-contain [scrollbar-gutter:stable] p-1.5 outline-none" renderEmptyState={() => <p className="p-3 text-sm text-muted-foreground">No matching options</p>}>
        {option => <ListBoxItem id={option.id} textValue={option.label} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm outline-none data-focused:bg-accent data-focused:text-accent-foreground data-selected:font-medium">
          {({ isSelected }) => <><span className="break-words">{option.label}</span>{isSelected && <Check className="size-4 shrink-0" />}</>}
        </ListBoxItem>}
      </ListBox>
      {items.length > 6 && <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">{items.length} options · Scroll to see more</p>}
    </Popover>
    </>}</ComboBoxStateContext.Consumer>
  </ComboBox>;
}

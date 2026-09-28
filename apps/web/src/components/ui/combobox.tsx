import { useEffect, useState, type ReactNode } from "react";
import { ComboBox, ComboBoxStateContext, Dialog, Group, ListBox, ListBoxItem, Modal, ModalOverlay, Popover } from "react-aria-components";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
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
  inputValue?: string; onInputValueChange?: (text: string) => void;
  createWhenNoMatches?: boolean; createOptionLabel?: (text: string) => string;
  renderIcon?: (optionId: string) => ReactNode; primaryHighlight?: boolean;
};

function useMobileChoices() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && (window.matchMedia?.("(max-width: 700px), (pointer: coarse)").matches ?? false));
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 700px), (pointer: coarse)");
    if (!query) return;
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

function useVisibleViewport(open: boolean) {
  const [viewport, setViewport] = useState(() => ({ top: 0, height: typeof window === "undefined" ? 800 : window.innerHeight }));
  useEffect(() => {
    if (!open) return;
    const visual = window.visualViewport;
    const update = () => setViewport({ top: visual?.offsetTop ?? 0, height: visual?.height ?? window.innerHeight });
    update();
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);
  return viewport;
}

function MobileChoices({ id, label, options, value, onChange, disabled, required, invalid, describedBy, placeholder, customValue, onCreate, inputValue, onInputValueChange, createWhenNoMatches, createOptionLabel, large, renderIcon, primaryHighlight }: SearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const viewport = useVisibleViewport(open);
  const selectedLabel = options.find(option => option.id === value)?.label ?? "";
  const query = search.trim();
  const matches = options.filter(option => matchesComboboxSearch(option.label, query));
  const canCreate = Boolean(onCreate && query && (!createWhenNoMatches || matches.length === 0) && !options.some(option => option.label.toLocaleLowerCase() === query.toLocaleLowerCase()) && query !== customValue);
  const show = () => { setSearch(inputValue ?? ""); setOpen(true); };
  const choose = (id: string) => {
    if (id === "__custom__") onCreate?.(query);
    else onChange(id);
    setOpen(false);
  };
  const visibleHeight = Math.max(1, viewport.height);
  return <>
    <Button id={id} type="button" variant="outline" isDisabled={disabled} aria-label={label} aria-required={required} aria-invalid={invalid} aria-describedby={describedBy} aria-haspopup="dialog" aria-expanded={open} onPress={show} className={`w-full min-w-0 justify-between gap-2 px-3 text-left font-normal ${large ? "min-h-12 text-base" : "min-h-11 text-sm"} ${invalid ? "border-destructive" : "border-input"} bg-background`}>
      <span className={`min-w-0 truncate ${inputValue || selectedLabel ? "text-foreground" : "text-muted-foreground"}`}>{inputValue || selectedLabel || placeholder}</span>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Button>
    <ModalOverlay data-slot="mobile-choice-overlay" isOpen={open} onOpenChange={setOpen} isDismissable className="fixed inset-x-0 z-50 bg-black/30" style={{ top: viewport.top, height: visibleHeight }}>
      <Modal className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none" style={{ height: Math.min(visibleHeight * .82, 640) }}>
        <Dialog aria-label={`Choose ${label}`} className="flex min-h-0 flex-1 flex-col outline-none">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">{label}</h2>
            <Button type="button" variant="ghost" size="icon" aria-label="Close choices" onPress={() => setOpen(false)}><X className="size-5" aria-hidden="true" /></Button>
          </div>
          <div className="shrink-0 px-4 py-3">
            <div className="flex min-h-12 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Input aria-label={`Search ${label}`} autoComplete="off" placeholder={placeholder} value={search} onChange={event => { setSearch(event.target.value); onInputValueChange?.(event.target.value); }} className="h-11 border-0 px-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0" />
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-label={`${label} choices`}>
            {matches.map(option => <li key={option.id}><Button type="button" variant="ghost" aria-pressed={option.id === value} onPress={() => choose(option.id)} className={`mb-1 flex min-h-14 h-auto w-full justify-start gap-3 whitespace-normal rounded-xl px-3 py-2 text-left text-base ${primaryHighlight ? "hover:bg-primary/10" : "hover:bg-accent"}`}>
              {renderIcon && <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">{renderIcon(option.id)}</span>}
              <span className="min-w-0 flex-1 break-words">{option.label}</span>
              {option.id === value && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
            </Button></li>)}
            {canCreate && <li><Button type="button" variant="ghost" onPress={() => choose("__custom__")} className="mb-1 flex min-h-14 h-auto w-full justify-start gap-3 whitespace-normal rounded-xl bg-primary/5 px-3 py-2 text-left text-base text-primary"><Plus className="size-5 shrink-0" aria-hidden="true" /><span className="break-words">{createOptionLabel?.(query) ?? `Use “${query}” as Other`}</span></Button></li>}
            {!matches.length && !canCreate && <li className="p-4 text-center text-sm text-muted-foreground">No matching options</li>}
          </ul>
          {inputValue !== undefined && <div className="shrink-0 border-t border-border p-3"><Button type="button" className="w-full" onPress={() => setOpen(false)}>Done</Button></div>}
        </Dialog>
      </Modal>
    </ModalOverlay>
  </>;
}
/** One themed, keyboard-operable search menu; custom values require an explicit Use action. */
export function SearchCombobox({ id, label, options, value, onChange, disabled, required, invalid, describedBy, placeholder = "Search or select…", customValue, onCreate, inputValue, onInputValueChange, createWhenNoMatches = false, createOptionLabel, large = false, renderIcon, primaryHighlight = false }: SearchComboboxProps) {
  const mobile = useMobileChoices();
  const selectedLabel = options.find(option => option.id === value)?.label || "";
  const [internalSearch, setInternalSearch] = useState(selectedLabel);
  const search = inputValue ?? internalSearch;
  const setSearch = (next: string) => { if (inputValue === undefined) setInternalSearch(next); else onInputValueChange?.(next); };
  useEffect(() => setInternalSearch(selectedLabel), [selectedLabel, value]);
  const query = search.trim();
  const matches = options.filter(option => matchesComboboxSearch(option.label, query));
  const canCreate = Boolean(onCreate && query && (!createWhenNoMatches || matches.length === 0) && !options.some(option => option.label.toLocaleLowerCase() === query.toLocaleLowerCase()) && query !== customValue);
  const items = [...(search === selectedLabel ? options : matches), ...(canCreate ? [{ id: "__custom__", label: createOptionLabel?.(query) ?? `Use “${query}” as Other` }] : [])];
  const selectedIcon = renderIcon && value && search === selectedLabel ? renderIcon(value) : null;
  if (mobile) return <MobileChoices id={id} label={label} options={options} value={value} onChange={onChange} disabled={disabled} required={required} invalid={invalid} describedBy={describedBy} placeholder={placeholder} customValue={customValue} onCreate={onCreate} inputValue={inputValue} onInputValueChange={onInputValueChange} createWhenNoMatches={createWhenNoMatches} createOptionLabel={createOptionLabel} large={large} renderIcon={renderIcon} primaryHighlight={primaryHighlight} />;
  return <ComboBox data-slot="search-combobox" aria-label={label} isDisabled={disabled} isRequired={required} isInvalid={invalid} allowsCustomValue allowsEmptyCollection menuTrigger="manual"
    selectedKey={value} inputValue={search} onInputChange={setSearch} items={items}
    onSelectionChange={key => { if (key === null) return; if (key === "__custom__") { onCreate?.(query); if (inputValue === undefined) setSearch(selectedLabel); } else { onChange(String(key)); setSearch(options.find(option => option.id === key)?.label || ""); } }}
    onBlur={() => { if (inputValue === undefined) setSearch(selectedLabel); }} className="w-full min-w-0">
    <ComboBoxStateContext.Consumer>{state => <>
    <Group data-slot="combobox-control" className={`flex items-center rounded-lg border border-input bg-background ${primaryHighlight ? "focus-within:bg-primary/10" : ""} ${large ? "min-h-12" : "min-h-11"}`}>
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
      }} className={`${large ? "h-12 md:text-base" : "h-11"} border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0`} />
      <Button variant="ghost" size="icon" className="mr-1 size-10" aria-label={`Show ${label} options`}><ChevronsUpDown className="size-4" /></Button>
    </Group>
    <Popover placement="bottom start" offset={4} className="z-50 flex max-h-[var(--available-height,18rem)] flex-col w-(--trigger-width) max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
      <ListBox<ComboboxOption> className="themed-scrollbar min-h-0 max-h-72 overflow-y-auto overscroll-contain p-1.5 outline-none" renderEmptyState={() => <p className="p-3 text-sm text-muted-foreground">No matching options</p>}>
        {option => {
          const icon = renderIcon?.(option.id);
          return <ListBoxItem id={option.id} textValue={option.label} className={({ isSelected, isFocused, isHovered }) => `flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 outline-none data-selected:font-medium ${option.id === "__custom__" && createOptionLabel ? "border-primary/25 bg-primary/5 font-medium text-brand-ink data-focused:bg-primary/10" : primaryHighlight ? isSelected || isFocused || isHovered ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary" : "border-transparent" : "border-transparent data-focused:bg-accent data-focused:text-accent-foreground"} ${large ? "min-h-12 text-base" : "min-h-11 text-sm"}`}>
            {({ isSelected, isFocused, isHovered }) => <><span className="flex min-w-0 items-center gap-3">{option.id === "__custom__" && createOptionLabel && <Plus className="size-4 shrink-0" aria-hidden="true"/>}{icon && <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors ${primaryHighlight ? isSelected || isFocused || isHovered ? "bg-primary text-primary-foreground shadow-sm" : "bg-primary/10 text-primary/70" : "bg-primary/10 text-brand-ink"}`} aria-hidden="true">{icon}</span>}<span className="break-words">{option.label}</span></span>{isSelected && !primaryHighlight && <Check className="size-4 shrink-0" />}</>}
          </ListBoxItem>;
        }}
      </ListBox>
    </Popover>
    </>}</ComboBoxStateContext.Consumer>
  </ComboBox>;
}

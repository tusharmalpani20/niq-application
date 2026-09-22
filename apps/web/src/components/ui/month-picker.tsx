import { useState } from "react";
import { Dialog, DialogTrigger, Popover } from "react-aria-components";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function MonthPicker({ id, value, disabled, onChange }: {
  id: string; value: string; disabled?: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const validYear = /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= 9999;
  const select = (date: string) => { onChange(date); setOpen(false); };
  const [selectedYear, selectedMonth] = value.split("-").map(Number);
  return <DialogTrigger isOpen={open} onOpenChange={next => {
    setOpen(next);
    if (next) setYear(String(selectedYear || new Date().getFullYear()));
  }}>
    <Button id={id} variant="outline" isDisabled={disabled} aria-label={`Report month${value ? `: ${months[selectedMonth! - 1]} ${selectedYear}` : ""}`} className="min-h-11 w-full justify-between bg-background font-normal">
      <span className={value ? "" : "text-muted-foreground"}>{value ? `${months[selectedMonth! - 1]} ${selectedYear}` : "Select month and year"}</span><CalendarDays aria-hidden="true" />
    </Button>
    <Popover placement="bottom start" className="z-50 w-72 rounded-xl border border-border bg-card p-4 text-foreground shadow-lg outline-none">
      <Dialog aria-label="Choose report month" className="outline-none">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Previous year" isDisabled={!validYear || Number(year) <= 1900} onPress={() => setYear(String(Number(year) - 1))}><ChevronLeft /></Button>
          <Input aria-label="Year" type="number" min={1900} max={9999} value={year} onChange={event => setYear(event.target.value)} className="min-w-0 flex-1 text-center font-semibold" />
          <Button variant="ghost" size="icon" aria-label="Next year" isDisabled={!validYear || Number(year) >= 9999} onPress={() => setYear(String(Number(year) + 1))}><ChevronRight /></Button>
        </div>
        {!validYear && <p className="mb-3 text-xs text-destructive" role="status">Enter a year from 1900 to 9999.</p>}
        <div className="grid grid-cols-3 gap-2">{months.map((month, index) => {
          const selected = selectedYear === Number(year) && selectedMonth === index + 1;
          return <Button key={month} variant={selected ? "default" : "ghost"} className="h-10" aria-label={`${month} ${year}`} aria-pressed={selected} isDisabled={!validYear} onPress={() => select(`${year}-${String(index + 1).padStart(2, "0")}`)}>{month.slice(0, 3)}</Button>;
        })}</div>
        <div className="mt-4 flex justify-between border-t border-border pt-3">
          <Button variant="ghost" size="sm" isDisabled={!value} onPress={() => select("")}>Clear</Button>
          <Button variant="ghost" size="sm" onPress={() => { const now = new Date(); select(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`); }}>This month</Button>
        </div>
      </Dialog>
    </Popover>
  </DialogTrigger>;
}

import { useState } from "react";
import { Dialog, DialogTrigger, Popover } from "react-aria-components";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";

export function DateCalendar({ value, label, disabled, onChange }: { value: string; label: string; disabled: boolean; onChange: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const valid = /^\d{4}$/.test(year) && +year >= 1900 && +year <= 9999;
  const first = valid ? new Date(+year, month, 1).getDay() : 0;
  const count = valid ? new Date(+year, month + 1, 0).getDate() : 0;
  const select = (date: string | null) => { onChange(date); setOpen(false); };
  const shift = (offset: number) => { const date = new Date(+year, month + offset, 1); setMonth(date.getMonth()); setYear(String(date.getFullYear())); };
  return <DialogTrigger isOpen={open} onOpenChange={next => { setOpen(next); if (next) { const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(); const safe = Number.isNaN(date.getTime()) ? new Date() : date; setMonth(safe.getMonth()); setYear(String(safe.getFullYear())); } }}>
    <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-11" aria-label={`Choose ${label.toLowerCase()} from calendar`} isDisabled={disabled}><CalendarDays /></Button>
    <Popover placement="bottom end" className="z-50 w-80 rounded-xl border border-border bg-card p-4 text-foreground shadow-lg">
      <Dialog aria-label={`Choose ${label.toLowerCase()}`} className="outline-none">
        <div className="mb-4 flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Previous month" isDisabled={!valid || (+year === 1900 && month === 0)} onPress={() => shift(-1)}><ChevronLeft /></Button>
          <span className="flex-1 text-sm font-semibold" aria-live="polite">{new Date(2026, month, 1).toLocaleString("en-IN", { month: "long" })}</span>
          <Input aria-label="Year" className="w-20 text-center" type="number" min={1900} max={9999} value={year} onChange={event => setYear(event.target.value)} />
          <Button variant="ghost" size="icon" aria-label="Next month" isDisabled={!valid || (+year === 9999 && month === 11)} onPress={() => shift(1)}><ChevronRight /></Button>
        </div>
        {!valid && <p role="status" className="text-xs text-destructive">Enter a year from 1900 to 9999.</p>}
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span key={day} className="py-2 text-xs text-muted-foreground">{day}</span>)}
          {Array.from({ length: first }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: count }, (_, index) => { const day = index + 1; const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; return <Button key={day} variant={value === date ? "default" : "ghost"} className="h-9 p-0" aria-label={`${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`} aria-pressed={value === date} onPress={() => select(date)}>{day}</Button>; })}
        </div>
        <div className="mt-3 flex justify-between border-t border-border pt-3"><Button variant="ghost" size="sm" isDisabled={!value} onPress={() => select(null)}>Clear</Button><Button variant="ghost" size="sm" onPress={() => { const now = new Date(); select(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`); }}>Today</Button></div>
      </Dialog>
    </Popover>
  </DialogTrigger>;
}

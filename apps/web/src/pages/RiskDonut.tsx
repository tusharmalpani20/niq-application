import { useState, type PointerEvent } from "react";

type Category = "low" | "moderate" | "high";
type Counts = Record<Category, number>;

export function RiskDonut({ counts, total, centerLabel, labels }: { counts: Counts; total: number; centerLabel: string; labels: Record<Category, string> }) {
  const [hoveredCategory, setHoveredCategory] = useState<Category | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const low = total ? counts.low / total * 100 : 0;
  const moderate = total ? counts.moderate / total * 100 : 0;
  const categories = [
    { id: "low" as const, label: labels.low, count: counts.low, color: "bg-primary" },
    { id: "moderate" as const, label: labels.moderate, count: counts.moderate, color: "bg-amber-400" },
    { id: "high" as const, label: labels.high, count: counts.high, color: "bg-rose-500" },
  ];
  const activeCategory = categories.find(item => item.id === (hoveredCategory ?? selectedCategory));
  const ringColor = (category: Category, color: string) => activeCategory && activeCategory.id !== category ? `color-mix(in srgb, ${color} 35%, var(--background))` : color;

  function hoverRing(event: PointerEvent<HTMLDivElement>) {
    if (!total) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    const radius = Math.hypot(x, y);
    // The center is a hole; angles start at 12 o'clock and proceed clockwise like conic-gradient.
    if (radius < bounds.width * 0.34 || radius > bounds.width / 2) { setHoveredCategory(null); return; }
    const percent = ((Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 100;
    setHoveredCategory(percent < low ? "low" : percent < low + moderate ? "moderate" : "high");
  }

  return <div className="mt-5">
    <div role="img" aria-label={`${total} ${centerLabel}; ${categories.map(item => `${item.label}: ${item.count}`).join(", ")}`} className={`mx-auto grid size-48 place-items-center rounded-full lg:size-56 ${total ? "cursor-pointer" : ""}`} style={{ background: total ? `conic-gradient(${ringColor("low", "var(--primary)")} 0 ${low}%, ${ringColor("moderate", "#fbbf24")} ${low}% ${low + moderate}%, ${ringColor("high", "#f43f5e")} ${low + moderate}% 100%)` : "var(--muted)" }} onPointerMove={hoverRing} onPointerLeave={() => setHoveredCategory(null)} onClick={() => { if (hoveredCategory) setSelectedCategory(current => current === hoveredCategory ? null : hoveredCategory); }}>
      <div className="grid size-32 place-content-center rounded-full bg-background text-center lg:size-40"><strong className="text-4xl">{activeCategory ? activeCategory.count : total}</strong><span className="text-xs text-muted-foreground">{activeCategory ? activeCategory.label : centerLabel}</span></div>
    </div>
    <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">{categories.map(item => <li key={item.id}><button type="button" aria-pressed={selectedCategory === item.id} onPointerEnter={() => setHoveredCategory(item.id)} onPointerLeave={() => setHoveredCategory(null)} onFocus={() => setHoveredCategory(item.id)} onBlur={() => setHoveredCategory(null)} onClick={() => setSelectedCategory(current => current === item.id ? null : item.id)} className={`flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary ${activeCategory?.id === item.id ? "bg-muted" : ""}`}><i aria-hidden="true" className={`size-2.5 rounded-full ${item.color}`} /><span>{item.label}</span><span className="tabular-nums text-muted-foreground">{item.count}</span></button></li>)}</ul>
  </div>;
}

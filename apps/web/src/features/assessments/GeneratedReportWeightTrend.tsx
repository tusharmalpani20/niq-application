import { useId } from "react";
import type { GeneratedReport } from "@niq/application-contracts";
import { cleanWeights, reportDate, weightChange } from "./generated-report-format";
import { weightChartPoints } from "./generated-report-chart";
import { kgToPounds } from "./measurement-units";

export function WeightTrend({ report }: { report: GeneratedReport }) {
  const gradientId = useId();
  const weights = cleanWeights(report);
  if (!weights.length) return null;
  const pounds = report.weightDisplayUnit === "lb";
  const unit = pounds ? "lbs" : "kg";
  const display = (kg: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(pounds ? kgToPounds(kg) : kg);
  const dateLabel = (item: typeof weights[number]) => item.label || reportDate(item.date);
  const points = weightChartPoints(weights, 600, 220);
  const change = weightChange(report);
  const priorComparison = weights.some(item => item.date === null);
  const magnitude = change ? Math.abs(change.percentage) : 0;
  const percentage = magnitude < 0.05 ? "<0.1" : magnitude.toFixed(1);
  const changeText = !change ? "" : change.percentage === 0 ? "No weight change" : `${percentage}% weight ${change.percentage > 0 ? "gain" : "loss"}`;
  return <section className="cr-panel cr-weight-panel">
    <div className="cr-panel-title"><h3>Patient weight trend ({unit})</h3>{change && <span className={`cr-change${change.percentage < 0 ? " cr-change-down" : change.percentage === 0 ? " cr-change-neutral" : ""}`} title={`Compared with ${dateLabel(change.first)}`}>{changeText}</span>}</div>
    {points.length >= 2 ? <>
      <div className="cr-weight-chart-wrap"><svg className="cr-weight-chart" viewBox="0 0 600 220" role="img" aria-label={`Patient weight in ${pounds ? "pounds" : "kilograms"}: ${weights.map(item => `${display(item.kg)} (${dateLabel(item)})`).join(", ")}. ${changeText}, compared with the previous reading.`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-primary, #34b5b9)" stopOpacity=".22"/>
          <stop offset="100%" stopColor="var(--brand-primary, #34b5b9)" stopOpacity=".015"/>
        </linearGradient></defs>
        {[18, 100, 182].map(y => <line key={y} x1="45" x2="565" y1={y} y2={y} stroke="#d8e8e8" strokeDasharray="4 5"/>)}
        <polygon points={`45,182 ${points.map(item => `${item.x},${item.y}`).join(" ")} 565,182`} fill={`url(#${gradientId})`}/>
        <polyline points={points.map(item => `${item.x},${item.y}`).join(" ")} fill="none" stroke="var(--brand-primary, #34b5b9)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={priorComparison ? "7 5" : undefined}/>
        {points.map((item, index) => <g key={`${item.date ?? "undated"}-${index}`}>
          <circle cx={item.x} cy={item.y} r={index === points.length - 1 ? 6 : 5} fill="white" stroke="var(--brand-primary, #34b5b9)" strokeWidth="3"/>
          <text x={item.x} y={item.y - 13} textAnchor="middle" className="cr-chart-value">{display(item.kg)}</text>
          <text x={item.x} y="207" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} className="cr-chart-axis">{dateLabel(item)}</text>
        </g>)}
      </svg></div>
    </> : <p className="cr-single-weight"><strong>{display(weights[0]!.kg)}</strong><span>{dateLabel(weights[0]!)}</span></p>}
  </section>;
}

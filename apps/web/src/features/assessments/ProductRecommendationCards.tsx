import { useState } from "react";
import { CalendarDays, CircleDot, Clock, FlaskConical, Package } from "lucide-react";
import type { GeneratedReport, GeneratedReportProductPlan } from "@niq/application-contracts";
import { productBenefits, reportDate } from "./generated-report-format";

function ProductImage({ source, name }: { source?: string | null; name: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!source || failedSource === source || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(source)) return null;
  return <img className="cr-recommendation-image" src={source} alt={name} onError={() => setFailedSource(source)}/>;
}

/** Product instructions stay verbatim from the saved plan. No dose or timing is inferred. */
export function ProductRecommendationCards({ report, plans }: { report: GeneratedReport; plans: GeneratedReportProductPlan[] }) {
  const durationText = (plan: GeneratedReportProductPlan) =>
    (plan.duration || (plan.durationAmount ? `${plan.durationAmount} days` : "—"))
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, date => reportDate(date));
  return <section className="cr-supplement cr-recommendations">
    <div className="cr-advice-heading"><span className="cr-advice-icon"><Package size={20} aria-hidden="true"/></span><h3>Nutritional supplement recommendations</h3></div>
    <div className="cr-recommendation-list">{plans.flatMap(plan => plan.items.map((item, index) => {
      const catalog = report.productCatalog?.find(product => [product.name, ...(product.aliases ?? [])]
        .some(name => name.trim().toLowerCase() === item.productName.trim().toLowerCase()));
      const benefits = productBenefits(report, item.productName);
      const frequency = item.timesPerDay != null ? (item.timesPerDay === 1 ? "Once daily" : `${item.timesPerDay} times daily`) : null;
      const timing = [frequency, item.mealTiming].filter(Boolean).join(" · ") || "—";
      return <article className="cr-recommendation-card" key={`${plan.id}-${index}`}>
        <div className="cr-recommendation-overview">
          <ProductImage source={catalog?.imageDataUrl} name={item.productName}/>
          <div className="cr-recommendation-summary"><h4>{item.productName}</h4>
        {benefits.length > 0 && <section className="cr-recommendation-benefits" aria-label={`Benefits of ${item.productName}`}>
          <h5>Key benefits</h5>
          <ul>{benefits.map((benefit, benefitIndex) => <li key={benefitIndex}><CircleDot size={14} aria-hidden="true"/><span>{benefit}</span></li>)}</ul>
        </section>}</div></div>
        <dl className="cr-recommendation-directions">
          <div className="cr-recommendation-quantity"><dt><Package size={15} aria-hidden="true"/>Daily quantity</dt><dd>{item.quantityPerDay ?? "—"}{item.unit ? ` ${item.unit}` : ""}</dd></div>
          <div className="cr-recommendation-timing"><dt><Clock size={15} aria-hidden="true"/>When to take</dt><dd>{timing}</dd></div>
          <div className="cr-recommendation-duration"><dt><CalendarDays size={15} aria-hidden="true"/>When to start / Duration</dt><dd>{durationText(plan)}</dd></div>
          <div className="cr-recommendation-preparation"><dt><FlaskConical size={15} aria-hidden="true"/>How to prepare</dt><dd>{item.preparation || "—"}</dd></div>
        </dl>
      </article>;
    }))}</div>
  </section>;
}

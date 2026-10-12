import { Circle, Document, Font, Image, Page, Path, Svg, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { GeneratedReport } from "./generated-report-api";
import { cleanWeights, metricText, reportAge, reportDate, reportGuidance, weightChange } from "./generated-report-format";
import { weightChartPoints } from "./generated-report-chart";

type PdfBrand = { name: string; primaryColor: string; logoDataUrl: string | null };
const ink = "#173447";
const muted = "#5c7480";
const pale = "#eef7f7";
const border = "#d8e6e8";
let fontsRegistered = false;

export function registerReportPdfFonts(regularSrc: string, boldSrc: string) {
  if (fontsRegistered) return;
  Font.register({ family: "NIQ Sans", fonts: [{ src: regularSrc, fontWeight: 400 }, { src: boldSrc, fontWeight: 700 }] });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: ink, fontFamily: "NIQ Sans", fontSize: 9.5, lineHeight: 1.45, paddingTop: 68, paddingBottom: 52, paddingHorizontal: 43 },
  cover: { backgroundColor: "#f7fbfb", color: ink, fontFamily: "NIQ Sans", paddingTop: 48, paddingBottom: 46, paddingHorizontal: 45 },
  coverLogo: { width: 110, height: 50, objectFit: "contain" },
  brandName: { fontSize: 15, fontWeight: 700 },
  kicker: { fontSize: 8, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 8 },
  coverTitle: { fontSize: 35, fontWeight: 700, lineHeight: 1.1, marginTop: 28, marginBottom: 20 },
  coverPatient: { fontSize: 17, fontWeight: 700, marginTop: 28, marginBottom: 7 },
  coverDetail: { color: muted, marginTop: 4, fontSize: 10 },
  coverBand: { position: "absolute", bottom: 75, left: 45, right: 45, padding: 15, backgroundColor: pale, borderRadius: 8 },
  coverBandText: { color: muted, fontSize: 9 },
  pageHeader: { position: "absolute", top: 25, left: 43, right: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: border },
  pageTitle: { fontSize: 15, fontWeight: 700, color: ink },
  pageBrand: { fontSize: 9, fontWeight: 700, color: muted },
  headerLogo: { width: 75, height: 27, objectFit: "contain" },
  footer: { position: "absolute", top: 795, left: 43, right: 43, flexDirection: "row", justifyContent: "space-between", paddingTop: 7, borderTopWidth: 1, borderTopColor: border, color: muted, fontSize: 7.5 },
  watermark: { position: "absolute", top: 410, left: 85, color: "#d9dfe0", opacity: 0.6, fontSize: 32, transform: "rotate(-30deg)" },
  intro: { marginBottom: 15, color: muted, fontSize: 9.5 },
  row: { flexDirection: "row", gap: 9 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  card: { padding: 12, borderWidth: 1, borderColor: border, borderRadius: 8, marginBottom: 9, backgroundColor: "#f9fcfc" },
  cardHalf: { width: "48.5%" },
  cardThird: { width: "31.5%" },
  cardLabel: { color: muted, fontSize: 8.2, marginBottom: 5 },
  cardValue: { fontWeight: 700, fontSize: 17, lineHeight: 1.2 },
  small: { color: muted, fontSize: 8.5 },
  headline: { fontWeight: 700, fontSize: 14, marginBottom: 5 },
  subhead: { fontWeight: 700, fontSize: 10.5, marginBottom: 6 },
  body: { fontSize: 9.5, lineHeight: 1.5 },
  feature: { padding: 15, marginBottom: 14, borderRadius: 8, backgroundColor: pale },
  separator: { borderBottomWidth: 1, borderBottomColor: border, marginVertical: 10 },
  caution: { padding: 11, marginBottom: 13, borderLeftWidth: 4, borderLeftColor: "#e5a23a", backgroundColor: "#fff6e7", color: "#755012" },
  label: { fontWeight: 700, fontSize: 7.5, letterSpacing: .7, textTransform: "uppercase", marginBottom: 4 },
  score: { fontSize: 32, fontWeight: 700, lineHeight: 1.1 },
  chartBox: { padding: 12, borderWidth: 1, borderColor: border, borderRadius: 8, marginTop: 10 },
  chart: { width: "100%", height: 145 },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 5, color: muted, fontSize: 7.5 },
  toxicityRow: { flexDirection: "row", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: border },
  toxicityLabel: { width: "30%" },
  toxicityText: { width: "67%", fontSize: 9.2, lineHeight: 1.5 },
});

function PdfLogo({ brand, cover = false }: { brand: PdfBrand; cover?: boolean }) {
  return brand.logoDataUrl
    ? <Image src={brand.logoDataUrl} style={cover ? styles.coverLogo : styles.headerLogo}/>
    : <Text style={cover ? styles.brandName : styles.pageBrand}>{brand.name}</Text>;
}

function PdfSection({ report, brand, title, children }: { report: GeneratedReport; brand: PdfBrand; title: string; children: ReactNode }) {
  return <Page size="A4" style={styles.page} wrap>
    <View fixed style={styles.pageHeader}><Text style={styles.pageTitle}>{title}</Text><PdfLogo brand={brand}/></View>
    <View fixed style={styles.footer}><Text>{brand.name} | Clinical nutrition report</Text><Text render={({ pageNumber, totalPages }) => `${report.assessment.reference} | ${pageNumber} / ${totalPages}`}/></View>
    {report.status !== "APPROVED" && <Text fixed style={styles.watermark}>DRAFT - NOT APPROVED</Text>}
    {children}
  </Page>;
}

function GuidancePdf({ report, kinds, color }: { report: GeneratedReport; kinds: Array<GeneratedReport["guidance"]["sections"][number]["kind"]>; color: string }) {
  const entries = kinds.flatMap(kind => reportGuidance(report, kind));
  return <View>{entries.map(item => <View key={item.id} style={styles.card}>
    <Text style={[styles.label, { color }]}>{item.kind === "product" ? "Product plan" : item.kind === "radiotherapy" ? "Radiotherapy" : item.kind === "comorbidity" ? "Co-morbidity" : item.kind === "treatment" ? "Treatment" : "Nutrition"}</Text>
    <Text style={styles.subhead}>{item.title}</Text><Text style={styles.body}>{item.text}</Text>
  </View>)}</View>;
}

function toxicitySource(item: GeneratedReport["guidance"]["sections"][number]) {
  if (item.matchSource === "assessment_answer") return item.matchedAnswerLabels?.length
    ? `Patient-reported in assessment: ${item.matchedAnswerLabels.join(", ")}` : "Patient-reported in assessment";
  if (item.matchSource === "weight_change") return item.matchedAnswerLabels?.length
    ? `Recorded weight change: ${item.matchedAnswerLabels.join(", ")}` : "Recorded weight change";
  if (item.matchSource === "clinician_confirmation") return "Clinician-confirmed for this patient";
  return "Possible effect from an earlier report";
}

export function GeneratedReportPdf({ report, brand }: { report: GeneratedReport; brand: PdfBrand }) {
  const color = /^#[0-9a-f]{6}$/i.test(brand.primaryColor) ? brand.primaryColor : "#239ca3";
  const faceMetrics = report.metrics.filter(metric => metric.source === "face_scan");
  const assessmentMetrics = report.metrics.filter(metric => metric.source === "assessment");
  const weights = cleanWeights(report);
  const chart = weightChartPoints(weights, 500, 145);
  const change = weightChange(report);
  const age = reportAge(report.patient.dateOfBirth, report.assessment.completedAt);
  const toxicities = reportGuidance(report, "toxicity");
  const hasLegacyToxicities = toxicities.some(item => !item.matchSource || item.matchSource === "unknown");
  const hasMatchedToxicities = toxicities.some(item => item.matchSource && item.matchSource !== "unknown");
  const nutritionKinds = ["nutrition", "radiotherapy", "product", "comorbidity", "treatment"] as const;
  const hasNutrition = nutritionKinds.some(kind => reportGuidance(report, kind).length > 0);
  return <Document title={`Clinical nutrition report - ${report.assessment.reference}`} author={brand.name} subject="Clinical nutrition assessment">
    <Page size="A4" style={styles.cover}>
      <PdfLogo brand={brand} cover/>
      <Text style={[styles.kicker, { color, marginTop: 90 }]}>{report.status === "APPROVED" ? "Approved assessment report" : "Draft for clinical review"}</Text>
      <Text style={styles.coverTitle}>Medical{"\n"}Nutrition{"\n"}Therapy Report</Text>
      <Svg width="460" height="175"><Path d="M 230 170 C 260 10, 395 -10, 470 75" stroke={color} strokeWidth="32" fill="none" opacity="0.15"/><Path d="M 280 180 C 310 55, 405 25, 470 90" stroke={color} strokeWidth="9" fill="none" opacity="0.6"/></Svg>
      <Text style={styles.coverPatient}>{report.patient.displayName}</Text>
      <Text style={styles.coverDetail}>{report.patient.reference} | {report.assessment.reference}</Text>
      <Text style={styles.coverDetail}>Assessment: {reportDate(report.assessment.completedAt)}</Text>
      <View style={styles.coverBand}><Text style={styles.coverBandText}>Rule-based guidance  |  {report.status === "APPROVED" ? "Clinician approved" : "Clinical review required"}  |  Built around the saved assessment</Text></View>
      {report.status !== "APPROVED" && <Text fixed style={styles.watermark}>DRAFT - NOT APPROVED</Text>}
      <View fixed style={styles.footer}><Text>{brand.name}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}/></View>
    </Page>
    <PdfSection report={report} brand={brand} title="Patient overview">
      <View style={styles.feature}><Text style={styles.headline}>{report.patient.displayName}</Text><Text style={styles.small}>{report.patient.reference} | {age === null ? "Age not available" : `${age} years`} | {report.patient.gender || "Gender not recorded"}</Text><Text style={styles.small}>Assessment completed {reportDate(report.assessment.completedAt)}</Text></View>
      {report.narrative.overview ? <View style={styles.card}><Text style={[styles.label, { color }]}>Clinical overview</Text><Text style={styles.body}>{report.narrative.overview}</Text></View> : <View/>}
      <View style={styles.wrapRow}>{assessmentMetrics.map(metric => <View key={metric.id} style={[styles.card, styles.cardHalf]}><Text style={styles.cardLabel}>{metric.label}</Text><Text style={styles.cardValue}>{metricText(metric)}</Text>{metric.measuredAt && <Text style={styles.small}>{reportDate(metric.measuredAt)}</Text>}</View>)}</View>
    </PdfSection>
    {faceMetrics.length > 0 && <PdfSection report={report} brand={brand} title="Vital IQ - Face scan">
      <Text style={styles.intro}>Face-scan readings are separate from the NIQ assessment risk score.</Text>
      <View style={styles.wrapRow}>{faceMetrics.map(metric => <View key={metric.id} style={[styles.card, styles.cardThird]}><Text style={styles.cardLabel}>{metric.label}</Text><Text style={styles.cardValue}>{metricText(metric)}</Text>{metric.measuredAt && <Text style={styles.small}>{reportDate(metric.measuredAt)}</Text>}</View>)}</View>
    </PdfSection>}
    {(report.classification || weights.length > 0 || report.narrative.keyFindings) && <PdfSection report={report} brand={brand} title="Nutrition status and findings">
      {report.classification && <View style={styles.feature}><Text style={[styles.label, { color }]}>NIQ assessment</Text><Text style={[styles.score, { color }]}>{report.classification.score} points</Text><Text style={styles.headline}>{report.classification.label}</Text></View>}
      {report.narrative.keyFindings && <View style={styles.card}><Text style={[styles.label, { color }]}>Key findings</Text><Text style={styles.body}>{report.narrative.keyFindings}</Text></View>}
      {weights.length > 0 && <View style={styles.chartBox}><Text style={styles.subhead}>Weight trend</Text>
        {change && <Text style={styles.small}>{change.percentage > 0 ? "+" : ""}{change.percentage.toFixed(1)}% from {change.basis}</Text>}
        {chart.length > 1 ? <><Svg style={styles.chart} viewBox="0 0 500 145">
          <Path d={chart.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ")} stroke={color} strokeWidth="3" fill="none"/>
          {chart.map((point, index) => <Circle key={`${point.date ?? "undated"}-${index}`} cx={point.x} cy={point.y} r="5" fill="#ffffff" stroke={color} strokeWidth="2"/>)}
        </Svg><View style={styles.chartLabels}>{weights.map((item, index) => <Text key={`${item.date ?? "undated"}-${index}`}>{item.label || reportDate(item.date)}{"\n"}{item.kg} kg</Text>)}</View></> : <Text style={styles.body}>{weights[0]!.kg} kg recorded {weights[0]!.label || reportDate(weights[0]!.date)}. A trend appears when another weight is available.</Text>}
      </View>}
    </PdfSection>}
    {hasNutrition && <PdfSection report={report} brand={brand} title="Nutrition and care plan">
      <Text style={styles.intro}>Guidance matched to this assessment and its saved rule version. The treating clinician should individualise the plan.</Text>
      <GuidancePdf report={report} kinds={[...nutritionKinds]} color={color}/>
    </PdfSection>}
    {toxicities.length > 0 && <PdfSection report={report} brand={brand} title={hasMatchedToxicities ? "Matched treatment effects and nutrition guidance" : "Possible treatment effects - earlier report"}>
      {hasMatchedToxicities && <Text style={styles.intro}>This nutrition guidance follows assessment answers, recorded weight change, or clinician confirmation. It does not establish that treatment caused an effect.</Text>}
      {hasLegacyToxicities && <View style={styles.caution}><Text>Some guidance in this earlier report lists possible drug-class effects. Those entries are not confirmed symptoms for this patient.</Text></View>}
      {toxicities.map(item => <View key={item.id} style={styles.toxicityRow} wrap={item.text.length > 1200}><View style={styles.toxicityLabel}><Text style={[styles.label, { color }]}>{item.drugClass || "Selected drug class"}</Text><Text style={styles.subhead}>{item.title}</Text><Text style={styles.small}>{toxicitySource(item)}</Text></View><Text style={styles.toxicityText}>{item.text}</Text></View>)}
    </PdfSection>}
    {(report.narrative.actionSummary || report.narrative.monitoringSummary) && <PdfSection report={report} brand={brand} title="Action plan and monitoring">
      {report.narrative.actionSummary && <View style={styles.card}><Text style={[styles.label, { color }]}>Action plan</Text><Text style={styles.body}>{report.narrative.actionSummary}</Text></View>}
      {report.narrative.monitoringSummary && <View style={styles.card}><Text style={[styles.label, { color }]}>What to monitor</Text><Text style={styles.body}>{report.narrative.monitoringSummary}</Text></View>}
      <View style={styles.feature}><Text style={styles.small}>This report was prepared from a saved assessment and rule version. Review new or worsening symptoms with the treating clinical team.</Text></View>
    </PdfSection>}
  </Document>;
}

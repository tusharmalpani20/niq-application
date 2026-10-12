import { Circle, Document, Font, Image, Page, Path, Rect, Svg, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { adultBmiCategory, adultBmiReference, calculateAssessmentBmi, reportFaceScanAdditionalMetricGroups, riskColorHex, type GeneratedReport } from "@niq/application-contracts";
import { cleanWeights, metricText, reportAge, reportDate, reportGuidance } from "./generated-report-format";
import { weightChartPoints } from "./generated-report-chart";
import { accessibleBrandInk } from "./accessible-brand-ink";

export type PdfBrand = {
  name: string;
  primaryColor: string;
  secondaryColor?: string;
  logoDataUrl: string | null;
  applicationLogoDataUrl?: string | null;
  partnerLogoDataUrl?: string | null;
};
type Metric = GeneratedReport["metrics"][number];
type IconName = "person" | "heart" | "shield" | "weight" | "height" | "chart" | "drop" | "pulse" | "lungs" | "food" | "package" | "calendar" | "clipboard" | "check" | "alert";
type Palette = { primary: string; secondary: string; ink: string; muted: string; soft: string; softSecondary: string; line: string; white: string };
let fontsRegistered = false;

function tint(hex: string, amount: number) {
  return `#${[1, 3, 5].map(offset => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * amount + 255 * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

function palette(brand: PdfBrand): Palette {
  const primary = /^#[0-9a-f]{6}$/i.test(brand.primaryColor) ? brand.primaryColor : "#239ca3";
  const secondary = brand.secondaryColor && /^#[0-9a-f]{6}$/i.test(brand.secondaryColor) ? brand.secondaryColor : primary;
  return { primary, secondary, ink: "#193744", muted: "#59717c", soft: tint(primary, 0.1), softSecondary: tint(secondary, 0.1), line: tint(primary, 0.22), white: "#ffffff" };
}

export function registerReportPdfFonts(regularSrc: string, boldSrc: string) {
  if (fontsRegistered) return;
  Font.register({ family: "NIQ Sans", fonts: [{ src: regularSrc, fontWeight: 400 }, { src: boldSrc, fontWeight: 700 }] });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: "#193744", fontFamily: "NIQ Sans", fontSize: 9, lineHeight: 1.42, paddingTop: 88, paddingBottom: 53, paddingHorizontal: 38 },
  cover: { backgroundColor: "#ffffff", color: "#193744", fontFamily: "NIQ Sans", paddingTop: 39, paddingBottom: 48, paddingHorizontal: 43 },
  coverLogo: { width: 132, height: 54, objectFit: "contain" },
  headerLogo: { width: 73, height: 28, objectFit: "contain" },
  coverBrandMarks: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerBrandMarks: { flexDirection: "row", alignItems: "center", gap: 7 },
  coverApplicationLogo: { width: 87, height: 53, objectFit: "contain" },
  headerApplicationLogo: { width: 56, height: 34, objectFit: "contain" },
  coverPartnerLogo: { width: 126, height: 42, objectFit: "contain" },
  headerPartnerLogo: { width: 91, height: 31, objectFit: "contain" },
  brandName: { fontSize: 16, fontWeight: 700 },
  brandNameSmall: { fontSize: 9, fontWeight: 700, width: 108, textAlign: "right" },
  coverKicker: { fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 14 },
  coverTitle: { fontSize: 38, lineHeight: 1.1, fontWeight: 700, width: 345 },
  coverPatient: { fontSize: 19, fontWeight: 700, marginBottom: 6 },
  coverDetail: { color: "#59717c", fontSize: 10, marginTop: 3 },
  coverBadge: { flexDirection: "row", alignItems: "center", width: "31%", gap: 7, padding: 10, borderRadius: 9, backgroundColor: "#ffffff" },
  header: { position: "absolute", top: 23, left: 38, right: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottomWidth: 1.5 },
  headerTitle: { fontSize: 15, fontWeight: 700, marginLeft: 11 },
  headerNumber: { fontSize: 15, fontWeight: 700 },
  footer: { position: "absolute", top: 795, left: 38, right: 38, flexDirection: "row", justifyContent: "space-between", paddingTop: 7, borderTopWidth: 1, fontSize: 7.5, color: "#59717c" },
  eyebrow: { fontSize: 8, fontWeight: 700, letterSpacing: .9, textTransform: "uppercase", marginBottom: 5 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 5 },
  subTitle: { fontSize: 11, fontWeight: 700, marginBottom: 5 },
  body: { fontSize: 9.3, lineHeight: 1.48 },
  muted: { color: "#59717c", fontSize: 8.5 },
  row: { flexDirection: "row", gap: 10 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  panel: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 11, backgroundColor: "#ffffff" },
  softPanel: { borderRadius: 10, padding: 15, marginBottom: 11 },
  metricCard: { width: "31.8%", minHeight: 84, borderWidth: 1, borderRadius: 9, padding: 10, marginBottom: 1 },
  metricLabel: { fontSize: 8.1, color: "#59717c", marginTop: 7, marginBottom: 5 },
  metricValue: { fontSize: 16, lineHeight: 1.15, fontWeight: 700 },
  vitalDetailPanel: { borderWidth: 1, borderRadius: 9, marginBottom: 9, overflow: "hidden" },
  vitalDetailHeader: { paddingHorizontal: 11, paddingVertical: 7, fontSize: 9, fontWeight: 700 },
  vitalDetailBody: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 11, paddingBottom: 5 },
  vitalDetailRow: { width: "50%", flexDirection: "row", justifyContent: "space-between", gap: 6, paddingVertical: 6, paddingRight: 10, borderBottomWidth: .5 },
  largeValue: { fontSize: 21, fontWeight: 700, lineHeight: 1.15 },
  scoreCard: { width: "48.8%", minHeight: 132, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderRadius: 10 },
  scoreLabel: { fontSize: 9, fontWeight: 700, marginBottom: 5 },
  divider: { borderBottomWidth: 1, marginVertical: 10 },
  sectionLabel: { fontSize: 8, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", marginBottom: 9 },
  chartPanel: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 9 },
  chart: { width: "100%", height: 108 },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  chartLabel: { fontSize: 7.5, color: "#59717c", maxWidth: 105 },
  productCard: { borderWidth: 1, borderRadius: 10, padding: 10, width: "48.8%", minHeight: 72 },
  productQuantity: { fontSize: 23, fontWeight: 700, lineHeight: 1.1 },
  productName: { fontSize: 11, fontWeight: 700, marginBottom: 6 },
  noteRow: { flexDirection: "row", gap: 11, alignItems: "flex-start", paddingVertical: 11, borderBottomWidth: 1 },
  numberDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  numberText: { fontSize: 9, fontWeight: 700, color: "#ffffff" },
});

function Icon({ name, color, size = 21 }: { name: IconName; color: string; size?: number }) {
  const common = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const path: Record<IconName, ReactNode> = {
    person: <><Circle cx="12" cy="7" r="3" {...common}/><Path d="M5 21v-2c0-3.5 2.5-6 7-6s7 2.5 7 6v2" {...common}/></>,
    heart: <Path d="M20.8 8.8c0 4.5-8.8 10-8.8 10s-8.8-5.5-8.8-10a5 5 0 0 1 8.8-3.1 5 5 0 0 1 8.8 3.1Z" {...common}/>,
    shield: <><Path d="M12 2 20 5v6c0 5-3 8-8 11-5-3-8-6-8-11V5l8-3Z" {...common}/><Path d="m8.5 12 2.5 2.5 4.5-5" {...common}/></>,
    weight: <><Rect x="3" y="5" width="18" height="16" rx="3" {...common}/><Path d="M8 11a4 4 0 0 1 8 0M12 11l2-2" {...common}/></>,
    height: <><Path d="M5 3v18M19 3v18M5 4h14M5 20h14M12 7v10m-3-3 3 3 3-3m-6-4 3-3 3 3" {...common}/></>,
    chart: <><Path d="M3 20h18M4 16l5-5 4 3 7-9" {...common}/><Circle cx="9" cy="11" r="1" fill={color}/><Circle cx="20" cy="5" r="1" fill={color}/></>,
    drop: <Path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z" {...common}/>,
    pulse: <><Path d="M2 12h4l2.5-5 3.5 10 3-6 2 1h5" {...common}/></>,
    lungs: <><Path d="M12 4v13M10 10c-2-2-4-2-6 0-2 2-2 8 0 9 3 1 6-3 6-7V7M14 10c2-2 4-2 6 0 2 2 2 8 0 9-3 1-6-3-6-7V7" {...common}/></>,
    food: <><Path d="M5 3v7a3 3 0 0 0 6 0V3M8 3v18M17 3c-2 2-3 5-3 9h4v9M17 3v18" {...common}/></>,
    package: <><Path d="m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10" {...common}/></>,
    calendar: <><Rect x="3" y="5" width="18" height="16" rx="2" {...common}/><Path d="M7 3v4M17 3v4M3 10h18M7 14h3m4 0h3m-10 4h3" {...common}/></>,
    clipboard: <><Rect x="5" y="4" width="14" height="18" rx="2" {...common}/><Path d="M9 4V2h6v2M8 10h8M8 14h8M8 18h5" {...common}/></>,
    check: <><Circle cx="12" cy="12" r="9" {...common}/><Path d="m8 12 2.7 2.7L16 9" {...common}/></>,
    alert: <><Path d="M12 3 22 21H2L12 3Z" {...common}/><Path d="M12 9v5M12 18h.01" {...common}/></>,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24">{path[name]}</Svg>;
}

function PdfLogo({ brand, cover = false }: { brand: PdfBrand; cover?: boolean }) {
  if (brand.logoDataUrl) return <Image src={brand.logoDataUrl} style={cover ? styles.coverLogo : styles.headerLogo}/>;
  if (!brand.applicationLogoDataUrl || !brand.partnerLogoDataUrl) {
    return <Text style={cover ? styles.brandName : styles.brandNameSmall}>{brand.name}</Text>;
  }
  return <View style={cover ? styles.coverBrandMarks : styles.headerBrandMarks}>
    <Image src={brand.applicationLogoDataUrl} style={cover ? styles.coverApplicationLogo : styles.headerApplicationLogo}/>
    <View style={{ borderLeftWidth: 1, borderLeftColor: "#dce9ec", paddingLeft: cover ? 11 : 7, alignItems: "center" }}>
      <Image src={brand.partnerLogoDataUrl} style={cover ? styles.coverPartnerLogo : styles.headerPartnerLogo}/>
      <Text style={{ color: "#59717c", fontSize: cover ? 7 : 5.7, fontWeight: 700 }}>Knowledge Partner</Text>
    </View>
  </View>;
}

function ReportPage({ report, brand, number, title, icon, children }: { report: GeneratedReport; brand: PdfBrand; number: number; title: string; icon: IconName; children: ReactNode }) {
  const theme = palette(brand);
  return <Page size="A4" style={styles.page} wrap>
    <View fixed style={[styles.header, { borderBottomColor: theme.line }]}>
      <View style={{ flexDirection: "row", alignItems: "center" }}><Text style={[styles.headerNumber, { color: accessibleBrandInk(theme.primary, [theme.white]) }]}>{String(number).padStart(2, "0")}</Text><Text style={styles.headerTitle}>{title}</Text><View style={{ marginLeft: 8 }}><Icon name={icon} color={theme.primary} size={18}/></View></View>
      <PdfLogo brand={brand}/>
    </View>
    <View fixed style={[styles.footer, { borderTopColor: theme.line }]}><Text>{brand.name}  |  Medical nutrition therapy</Text><Text render={({ pageNumber, totalPages }) => `${report.assessment.reference}  |  ${pageNumber} / ${totalPages}`}/></View>
    {children}
  </Page>;
}

function MetricCard({ metric, theme, icon, width }: { metric: Metric; theme: Palette; icon?: IconName; width?: string }) {
  return <View wrap={false} style={[styles.metricCard, { width: width ?? "31.8%", borderColor: metric.outsideReferenceRange ? "#e2be7d" : theme.line, backgroundColor: metric.outsideReferenceRange ? "#fffaf0" : theme.white }]}>
    <Icon name={icon ?? iconFor(metric.label)} color={theme.primary} size={19}/>
    <Text style={styles.metricLabel}>{metric.label}</Text>
    <Text style={[styles.metricValue, { color: metric.outsideReferenceRange ? "#8a5b13" : theme.ink, fontSize: metric.id === "blood_pressure" ? 13 : 16 }]}>{metricText(metric)}</Text>
    {metric.outsideReferenceRange && metric.referenceRange && <Text style={{ color: "#8a5b13", fontSize: 6.8, marginTop: 3 }}>Reference: {metric.referenceRange}</Text>}
  </View>;
}

function iconFor(label: string): IconName {
  if (/weight|bmi/i.test(label)) return "weight";
  if (/height/i.test(label)) return "height";
  if (/heart|blood pressure/i.test(label)) return "heart";
  if (/oxygen|fluid/i.test(label)) return "drop";
  if (/breath/i.test(label)) return "lungs";
  if (/diet|appetite|intake/i.test(label)) return "food";
  return "pulse";
}

function arcPath(percent: number) {
  const share = Math.min(.999, Math.max(0, percent / 100));
  const angle = -Math.PI / 2 + share * Math.PI * 2;
  const x = 43 + 31 * Math.cos(angle);
  const y = 43 + 31 * Math.sin(angle);
  return `M 43 12 A 31 31 0 ${share > .5 ? 1 : 0} 1 ${x} ${y}`;
}

function ScoreRing({ value, maximum, theme, size = 86 }: { value: number; maximum: number; theme: Palette; size?: number }) {
  const percent = maximum > 0 ? value / maximum * 100 : 0;
  return <View style={{ width: size, height: size, position: "relative" }}>
    <Svg width={size} height={size} viewBox="0 0 86 86"><Circle cx="43" cy="43" r="31" stroke={theme.line} strokeWidth="9" fill="none"/>{percent > 0 && <Path d={arcPath(percent)} stroke={theme.primary} strokeWidth="9" strokeLinecap="round" fill="none"/>}</Svg>
    <Text style={{ position: "absolute", top: size * .34, left: 0, right: 0, textAlign: "center", fontSize: size * .24, fontWeight: 700, color: theme.ink }}>{value}</Text>
  </View>;
}

function scoreValue(metric: Metric) {
  const value = Number.parseFloat(metric.value);
  return Number.isFinite(value) ? value : null;
}

function ScoreMetric({ metric, theme }: { metric: Metric; theme: Palette }) {
  const value = scoreValue(metric);
  const hasRing = value !== null && value >= 0 && value <= 100;
  return <View wrap={false} style={[styles.scoreCard, { borderColor: theme.line, backgroundColor: theme.soft }]}>
    {hasRing ? <ScoreRing value={value} maximum={100} theme={theme}/> : <Icon name="pulse" color={theme.primary} size={38}/>}<View style={{ flex: 1 }}><Text style={styles.scoreLabel}>{metric.label}</Text><Text style={styles.muted}>{hasRing ? "out of 100" : metric.unit ?? "Vital IQ reading"}</Text></View>
  </View>;
}

function VitalDetailGroup({ title, metrics, theme }: { title: string; metrics: Metric[]; theme: Palette }) {
  if (!metrics.length) return null;
  return <View wrap={false} style={[styles.vitalDetailPanel, { borderColor: theme.line }]}>
    <Text style={[styles.vitalDetailHeader, { color: accessibleBrandInk(theme.primary, [theme.soft]), backgroundColor: theme.soft }]}>{title}</Text>
    <View style={styles.vitalDetailBody}>{metrics.map(metric => <View key={metric.id} style={[styles.vitalDetailRow, { borderBottomColor: theme.line }]}><Text style={[styles.muted, { flex: 1 }]}>{metric.label}</Text><View style={{ maxWidth: "53%" }}><Text style={{ fontSize: 8.2, fontWeight: 700, color: metric.outsideReferenceRange ? "#8a5b13" : theme.ink, textAlign: "right" }}>{metricText(metric)}</Text>{metric.outsideReferenceRange && metric.referenceRange && <Text style={{ color: "#8a5b13", fontSize: 6.5, textAlign: "right" }}>Reference: {metric.referenceRange}</Text>}</View></View>)}</View>
  </View>;
}

function bmiArcPoint(value: number): [number, number] {
  const angle = Math.PI * (1 - (value - 10) / 30);
  return [120 + 89 * Math.cos(angle), 108 - 89 * Math.sin(angle)];
}

function bmiArcPath(start: number, end: number) {
  const [x1, y1] = bmiArcPoint(start);
  const [x2, y2] = bmiArcPoint(end);
  return `M ${x1} ${y1} A 89 89 0 0 1 ${x2} ${y2}`;
}

function BmiReferencePanel({ metric, age, weight, height, theme }: { metric: Metric; age: number | null; weight: number | null; height: number | null; theme: Palette }) {
  const exactBmi = weight !== null && height !== null ? calculateAssessmentBmi(height, weight) : null;
  const adult = age !== null && age >= 20 && exactBmi !== null;
  const marker = adult ? bmiArcPoint(Math.max(10, Math.min(40, exactBmi))) : null;
  return <View wrap={false} style={[styles.softPanel, { backgroundColor: theme.soft, borderWidth: 1, borderColor: theme.line }]}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <View style={{ flex: 1 }}><Text style={[styles.sectionLabel, { color: accessibleBrandInk(theme.primary, [theme.soft]) }]}>Body mass index</Text><Text style={[styles.largeValue, { fontSize: 27 }]}>{metric.value} <Text style={[styles.muted, { fontSize: 9, fontWeight: 400 }]}>kg/m²</Text></Text>
        {adult && <Text style={[styles.subTitle, { marginTop: 7 }]}>{adultBmiCategory(exactBmi)}  |  Adult reference</Text>}
        <Text style={styles.muted}>BMI is a screening tool, not a diagnosis.</Text></View>
      {adult && <Svg width={214} height={109} viewBox="0 0 240 122">{adultBmiReference.map(band => <Path key={band.label} d={bmiArcPath(band.min, band.max)} fill="none" stroke={band.color} strokeWidth={15}/>)}{marker && <><Circle cx={marker[0]} cy={marker[1]} r={10} fill="#ffffff" stroke={theme.ink} strokeWidth={2.5}/><Circle cx={marker[0]} cy={marker[1]} r={3} fill={theme.ink}/></>}</Svg>}
    </View>
    {adult && <View style={{ flexDirection: "row", gap: 5, borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 8, marginTop: 8 }}>{adultBmiReference.map(band => <View key={band.label} style={{ width: "25%", flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: band.color }}/><Text style={{ fontSize: 6.8 }}>{band.label}</Text><Text style={[styles.muted, { fontSize: 6.5 }]}>{band.range}</Text></View>)}</View>}
  </View>;
}

function NarrativePanel({ title, text, icon, theme, soft = false, accent = false }: { title: string; text: string; icon: IconName; theme: Palette; soft?: boolean; accent?: boolean }) {
  return <View wrap={false} style={[styles.panel, { borderColor: theme.line, borderLeftWidth: accent ? 3 : 1, borderLeftColor: accent ? theme.primary : theme.line, backgroundColor: soft ? theme.soft : theme.white }]}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}><Icon name={icon} color={theme.primary} size={20}/><Text style={[styles.subTitle, { marginBottom: 0 }]}>{title}</Text></View>
    <Text style={styles.body}>{text}</Text>
  </View>;
}

function CareStep({ number, title, text, icon, theme, width }: { number: string; title: string; text: string; icon: IconName; theme: Palette; width: "48.8%" | "100%" }) {
  return <View wrap={false} style={[styles.panel, { width, minHeight: width === "48.8%" ? 122 : undefined, borderColor: theme.line, backgroundColor: theme.soft }]}>
    <View style={{ flexDirection: "row", gap: 9, alignItems: "center", marginBottom: 9 }}>
      <View style={[styles.numberDot, { backgroundColor: theme.primary }]}><Text style={styles.numberText}>{number}</Text></View>
      <Text style={[styles.subTitle, { flex: 1, marginBottom: 0 }]}>{title}</Text>
      <Icon name={icon} color={theme.primary} size={18}/>
    </View>
    <Text style={styles.body}>{text}</Text>
  </View>;
}

function productParts(report: GeneratedReport) {
  const section = reportGuidance(report, "product").find(item => item.title.toLowerCase() === "product plan");
  if (!section) return null;
  const [dose, duration] = section.text.split("\n").map(part => part.trim()).filter(Boolean);
  if (!dose) return null;
  const items = dose.split(/\s+\+\s+/).map(part => {
    const scoop = /^([^:]+):\s*(\d+(?:\.\d+)?)\s+(.+)$/.exec(part);
    if (scoop) return { name: scoop[1]!.trim(), quantity: scoop[2]!, detail: scoop[3]!.trim() };
    const regular = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(part);
    if (regular) return { name: regular[2]!.trim(), quantity: regular[1]!, detail: "per day" };
    return { name: part.trim(), quantity: "", detail: "" };
  });
  return { items, duration };
}

function targetValue(text: string, label: "energy" | "protein") {
  const match = new RegExp(`${label}[:\\s]*([0-9]+(?:\\.[0-9]+)?\\s*[–-]\\s*[0-9]+(?:\\.[0-9]+)?\\s*${label === "energy" ? "kcal" : "g"}\\s*\\/\\s*kg\\s*\\/\\s*day)`, "i").exec(text);
  return match?.[1]?.replace(/\s+/g, " ") ?? null;
}

function nutritionTargets(report: GeneratedReport) {
  const source = reportGuidance(report, "nutrition").map(item => item.text).join("\n");
  return [
    { label: "Energy target", value: targetValue(source, "energy"), icon: "pulse" as IconName },
    { label: "Protein target", value: targetValue(source, "protein"), icon: "food" as IconName },
  ].filter((item): item is { label: string; value: string; icon: IconName } => Boolean(item.value));
}

function WeightGraphic({ report, theme }: { report: GeneratedReport; theme: Palette }) {
  const weights = cleanWeights(report);
  if (!weights.length) return null;
  const chartHeight = 108;
  const points = weightChartPoints(weights, 470, chartHeight);
  return <View wrap={false} style={[styles.chartPanel, { borderColor: theme.line }]}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}><Icon name="chart" color={theme.primary}/><Text style={[styles.subTitle, { marginBottom: 0 }]}>Recorded weight history</Text></View>
    {points.length > 1 ? <>
      <Svg style={styles.chart} viewBox={`0 0 470 ${chartHeight}`}>
        {[30, 52, 74].map(y => <Path key={y} d={`M 10 ${y} L 460 ${y}`} stroke={theme.line} strokeWidth="1" strokeDasharray="4 5"/>)}
        <Path d={`M ${points[0]!.x} ${chartHeight - 24} ${points.map(point => `L ${point.x} ${point.y}`).join(" ")} L ${points[points.length - 1]!.x} ${chartHeight - 24} Z`} fill={theme.primary} opacity="0.08"/>
        <Path d={points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ")} stroke={theme.primary} strokeWidth="3.5" fill="none"/>
        {points.map((point, index) => <Circle key={`${point.date ?? "undated"}-${index}`} cx={point.x} cy={point.y} r="5" fill={theme.white} stroke={theme.primary} strokeWidth="2.5"/>)}
      </Svg>
      <View style={styles.chartLabels}>{weights.map((item, index) => <View key={`${item.date ?? "undated"}-${index}`} style={{ maxWidth: 115 }}><Text style={[styles.chartLabel, { fontWeight: 700, color: theme.ink }]}>{item.kg} kg</Text><Text style={styles.chartLabel}>{item.label || reportDate(item.date)}</Text></View>)}</View>
    </> : <View style={[styles.softPanel, { backgroundColor: theme.soft, marginBottom: 0 }]}><Text style={styles.largeValue}>{weights[0]!.kg} kg</Text><Text style={styles.muted}>{weights[0]!.label || reportDate(weights[0]!.date)}</Text></View>}
  </View>;
}

function ProductPlan({ report, theme }: { report: GeneratedReport; theme: Palette }) {
  const plan = productParts(report);
  if (!plan) return null;
  return <View wrap={false} style={[styles.panel, { borderColor: theme.line, padding: 11 }]}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}><Icon name="package" color={theme.primary}/><Text style={[styles.subTitle, { marginBottom: 0 }]}>Supplement recommendation</Text></View>
    <View style={styles.wrapRow}>{plan.items.map((item, index) => <View key={`${item.name}-${index}`} style={[styles.productCard, { borderColor: theme.line, backgroundColor: theme.softSecondary }]}>
      <Text style={styles.productName}>{item.name}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
        {item.quantity && <Text style={[styles.productQuantity, { color: accessibleBrandInk(theme.primary, [theme.softSecondary]) }]}>{item.quantity}</Text>}
        {item.detail && <Text style={styles.muted}>{item.detail}</Text>}
      </View>
    </View>)}</View>
    {plan.duration && <View style={{ flexDirection: "row", gap: 7, alignItems: "center", marginTop: 9 }}><Icon name="calendar" color={theme.primary} size={17}/><Text style={styles.body}>{plan.duration}</Text></View>}
  </View>;
}

export function GeneratedReportPdf({ report, brand }: { report: GeneratedReport; brand: PdfBrand }) {
  const theme = palette(brand);
  const brandInk = accessibleBrandInk(theme.primary, [theme.white, theme.soft]);
  const riskColor = riskColorHex(report.classification?.color);
  const riskInk = accessibleBrandInk(riskColor, [theme.white, tint(riskColor, 0.09)]);
  const age = reportAge(report.patient.dateOfBirth, report.assessment.completedAt);
  const assessmentMetrics = report.metrics.filter(metric => metric.source === "assessment");
  const physicalMetrics = assessmentMetrics.filter(metric => /^(current weight|height|bmi)$/i.test(metric.label));
  const observationMetrics = assessmentMetrics.filter(metric => !physicalMetrics.includes(metric));
  const primaryMeasurements = physicalMetrics.filter(metric => metric.id === "current_weight_kg" || metric.id === "height_cm");
  const bmiMetric = physicalMetrics.find(metric => metric.id === "bmi");
  const measurementNumber = (id: string) => {
    const raw = physicalMetrics.find(metric => metric.id === id)?.value.trim();
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const faceMetrics = report.metrics.filter(metric => metric.source === "face_scan" && metric.id !== "hba1c");
  const faceMetric = (id: string) => faceMetrics.find(metric => metric.id === id);
  const faceScores = ["wellness_score", "health_risk_score"].map(faceMetric).filter((metric): metric is Metric => Boolean(metric));
  const vitalPoints = faceMetric("vital_iq_points");
  const systolic = faceMetric("systolic");
  const diastolic = faceMetric("diastolic");
  const bloodPressure: Metric | null = systolic && diastolic
    ? { id: "blood_pressure", label: "Blood pressure", value: `${systolic.value}/${diastolic.value}`, unit: "mmHg", source: "face_scan",
      ...(systolic.referenceRange ? { referenceRange: systolic.referenceRange, outsideReferenceRange: systolic.outsideReferenceRange } : {}) } : null;
  const faceReadings = faceMetrics.filter(metric => ["heart_rate", "oxygen_saturation", "respiratory_rate", ...(bloodPressure ? [] : ["systolic", "diastolic"])].includes(metric.id));
  if (bloodPressure) faceReadings.push(bloodPressure);
  const groupedIds = new Set(["vital_iq_points", "wellness_score", "health_risk_score", "heart_rate", "oxygen_saturation", "respiratory_rate", "systolic", "diastolic"]);
  const detailGroups = reportFaceScanAdditionalMetricGroups.map(group => {
    const metrics = group.metrics.map(item => faceMetric(item.id)).filter((metric): metric is Metric => Boolean(metric));
    metrics.forEach(metric => groupedIds.add(metric.id));
    return { id: group.id, title: group.title, metrics };
  });
  const otherDetails = faceMetrics.filter(metric => !groupedIds.has(metric.id));
  detailGroups.find(group => group.id === "other")!.metrics.push(...otherDetails);
  const populatedDetails = detailGroups.filter(group => group.metrics.length > 0);
  const splitVitalDetails = populatedDetails.reduce((total, group) => total + group.metrics.length, 0) > 14;
  let firstPageDetailCount = 0;
  const firstPageDetails = populatedDetails.filter(group => {
    if (splitVitalDetails && firstPageDetailCount > 0 && firstPageDetailCount + group.metrics.length > 11) return false;
    firstPageDetailCount += group.metrics.length;
    return true;
  });
  const remainingDetails = populatedDetails.filter(group => !firstPageDetails.includes(group));
  const plan = productParts(report);
  const targets = nutritionTargets(report);
  const hasNutritionPage = Boolean(plan || report.narrative.nutritionAdvice || targets.length || report.narrative.treatmentAdvice);
  const hasConsiderations = Boolean(report.narrative.conditionAdvice || report.narrative.effectsAdvice);
  const hasFindings = Boolean(report.classification || report.narrative.keyFindings || (!hasNutritionPage && report.weightHistory.length) || observationMetrics.length);
  const hasActions = Boolean(report.narrative.actionSummary || report.narrative.monitoringSummary);
  const careStepWidth = report.narrative.actionSummary && report.narrative.monitoringSummary &&
    report.narrative.actionSummary.length + report.narrative.monitoringSummary.length < 420 ? "48.8%" : "100%";
  let page = 1;
  return <Document title={`Medical nutrition therapy report - ${report.assessment.reference}`} author={brand.name} subject="Clinical nutrition assessment">
    <Page size="A4" style={styles.cover}>
      <View style={{ position: "absolute", top: 126, right: -46, width: 310, height: 385 }}><Svg width="310" height="385" viewBox="0 0 310 385">
        <Circle cx="193" cy="192" r="146" fill={theme.soft} opacity=".65"/>
        <Circle cx="193" cy="192" r="116" stroke={theme.primary} strokeWidth="19" fill="none" opacity=".13"/>
        <Circle cx="193" cy="192" r="87" stroke={theme.secondary} strokeWidth="1.6" fill="none" opacity=".34"/>
        <Path d="M151 224c20-56 57-86 102-79-2 45-24 83-70 91-18 3-29-1-32-12Z" stroke={theme.primary} strokeWidth="4" fill={theme.white} opacity=".82"/>
        <Path d="M152 225c28-20 53-36 87-47M189 204l-5-27M211 191l18 14" stroke={theme.primary} strokeWidth="3" fill="none" opacity=".7"/>
      </Svg></View>
      <PdfLogo brand={brand} cover/>
      <View style={{ marginTop: 98 }}><Text style={[styles.coverKicker, { color: brandInk }]}>Personalised clinical nutrition</Text><Text style={styles.coverTitle}>Medical{"\n"}Nutrition{"\n"}Therapy Report</Text></View>
      <View style={{ position: "absolute", left: 43, right: 43, bottom: 164 }}><View style={{ height: 4, width: 82, borderRadius: 2, backgroundColor: theme.primary, marginBottom: 22 }}/><Text style={styles.coverPatient}>{report.patient.displayName}</Text><Text style={styles.coverDetail}>{[report.patient.reference, age === null ? null : `${age} years`, report.patient.gender].filter(Boolean).join("  |  ")}</Text><Text style={styles.coverDetail}>Assessment {report.assessment.reference}  |  {reportDate(report.assessment.completedAt)}</Text></View>
      <View style={{ position: "absolute", left: 43, right: 43, bottom: 56, flexDirection: "row", justifyContent: "space-between", padding: 9, borderRadius: 10, backgroundColor: theme.soft }}>
        <View style={styles.coverBadge}><Icon name="clipboard" color={theme.primary} size={20}/><Text style={{ fontSize: 8 }}>Assessment findings</Text></View>
        <View style={styles.coverBadge}><Icon name="food" color={theme.primary} size={20}/><Text style={{ fontSize: 8 }}>Nutrition guidance</Text></View>
        <View style={styles.coverBadge}><Icon name="heart" color={theme.primary} size={20}/><Text style={{ fontSize: 8 }}>Care and monitoring</Text></View>
      </View>
      <View fixed style={[styles.footer, { borderTopColor: theme.line }]}><Text>{brand.name}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}/></View>
    </Page>

    <ReportPage report={report} brand={brand} number={page++} title="Patient overview" icon="person">
      <View style={[styles.row, { alignItems: "stretch", marginBottom: 11 }]}>
        <View style={[styles.softPanel, { width: primaryMeasurements.length ? "48.8%" : "100%", minHeight: 174, marginBottom: 0, backgroundColor: theme.soft, alignItems: "center", justifyContent: "center", padding: 15 }]}>
          <View style={{ width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: theme.white, marginBottom: 10 }}><Icon name="person" color={theme.primary} size={31}/></View>
          <Text style={[styles.title, { textAlign: "center" }]}>{report.patient.displayName}</Text><Text style={[styles.muted, { textAlign: "center" }]}>{[report.patient.reference, age === null ? null : `${age} years`, report.patient.gender].filter(Boolean).join("  |  ")}</Text><Text style={[styles.muted, { marginTop: 4, textAlign: "center" }]}>Assessment completed {reportDate(report.assessment.completedAt)}</Text>
        </View>
        {primaryMeasurements.length > 0 && <View style={{ width: "48.8%", justifyContent: "space-between" }}>{primaryMeasurements.map(metric => <View key={metric.id} style={[styles.panel, { minHeight: primaryMeasurements.length === 1 ? 174 : 82, marginBottom: 0, borderColor: theme.line, justifyContent: "center" }]}><Text style={styles.metricLabel}>{metric.label}</Text><Text style={[styles.metricValue, { color: theme.ink }]}>{metricText(metric)}</Text></View>)}</View>}
      </View>
      {bmiMetric && <BmiReferencePanel metric={bmiMetric} age={age} weight={measurementNumber("current_weight_kg")} height={measurementNumber("height_cm")} theme={theme}/>}
      {report.narrative.overview && <NarrativePanel title="Clinical overview" text={report.narrative.overview} icon="clipboard" theme={theme}/>}
    </ReportPage>

    {faceMetrics.length > 0 && <><ReportPage report={report} brand={brand} number={page++} title="Vital IQ measurements" icon="pulse">
      {vitalPoints && <View style={[styles.softPanel, { backgroundColor: theme.soft, flexDirection: "row", alignItems: "center", gap: 10 }]}><Icon name="pulse" color={theme.primary} size={22}/><Text style={[styles.subTitle, { marginBottom: 0, flex: 1 }]}>Vital IQ points</Text><Text style={[styles.largeValue, { color: brandInk }]}>{vitalPoints.value}</Text></View>}
      {faceScores.length > 0 && <View style={[styles.row, { marginBottom: 13 }]}>{faceScores.map(metric => <ScoreMetric key={metric.id} metric={metric} theme={theme}/>)}</View>}
      {faceReadings.length > 0 && <><Text style={[styles.sectionLabel, { color: brandInk }]}>Vital signs</Text><View style={[styles.wrapRow, { marginBottom: 10 }]}>{faceReadings.map(metric => <MetricCard key={metric.id} metric={metric} theme={theme} width="23.3%"/>)}</View></>}
      {firstPageDetails.map(group => <VitalDetailGroup key={group.id} title={group.title} metrics={group.metrics} theme={theme}/>)}
      {!splitVitalDetails && faceMetrics[0]?.measuredAt && <View style={[styles.softPanel, { backgroundColor: theme.soft, flexDirection: "row", gap: 8, alignItems: "center", marginTop: 9 }]}><Icon name="calendar" color={theme.primary} size={17}/><Text style={styles.muted}>Captured {reportDate(faceMetrics[0].measuredAt)}</Text></View>}
    </ReportPage>
      {remainingDetails.length > 0 && <ReportPage report={report} brand={brand} number={page++} title="Vital IQ detailed measurements" icon="pulse">
        {remainingDetails.map(group => <VitalDetailGroup key={group.id} title={group.title} metrics={group.metrics} theme={theme}/>)}
        {faceMetrics[0]?.measuredAt && <View style={[styles.softPanel, { backgroundColor: theme.soft, flexDirection: "row", gap: 8, alignItems: "center", marginTop: 9 }]}><Icon name="calendar" color={theme.primary} size={17}/><Text style={styles.muted}>Captured {reportDate(faceMetrics[0].measuredAt)}</Text></View>}
      </ReportPage>}</>}

    {hasFindings && <ReportPage report={report} brand={brand} number={page++} title="Nutrition status and findings" icon="chart">
      <View style={[styles.row, { marginBottom: 11 }]}>
        {report.classification && <View style={[styles.softPanel, { backgroundColor: tint(riskColor, 0.09), width: "100%", minHeight: 112, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 0 }]}>
          <View style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 7, borderColor: riskColor, backgroundColor: theme.white, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 24, fontWeight: 700, color: riskInk }}>{report.classification.score}</Text></View><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: brandInk }]}>NIQ assessment</Text><Text style={[styles.subTitle, { color: riskInk }]}>{report.classification.label}</Text><Text style={styles.muted}>points</Text></View>
          {report.narrative.keyFindings && <View style={{ width: "48%", borderLeftWidth: 1, borderLeftColor: tint(riskColor, 0.7), paddingLeft: 12 }}><Text style={[styles.muted, { lineHeight: 1.4 }]}>{report.narrative.keyFindings}</Text></View>}
        </View>}
        {!report.classification && report.narrative.keyFindings && <View style={{ width: "100%" }}><NarrativePanel title="Key findings" text={report.narrative.keyFindings} icon="clipboard" theme={theme}/></View>}
      </View>
      {observationMetrics.length > 0 && <><Text style={[styles.sectionLabel, { color: brandInk }]}>Assessment observations</Text><View style={[styles.wrapRow, { marginBottom: 11 }]}>{observationMetrics.map(metric => <MetricCard key={metric.id} metric={metric} theme={theme}/>)}</View></>}
      {!hasNutritionPage && <WeightGraphic report={report} theme={theme}/>}
    </ReportPage>}

    {hasNutritionPage && <ReportPage report={report} brand={brand} number={page++} title="Nutrition plan" icon="food">
      {targets.length > 0 && <><Text style={[styles.sectionLabel, { color: brandInk }]}>Daily nutrition targets</Text><View style={[styles.wrapRow, { marginBottom: 11 }]}>{targets.map(target => <View key={target.label} style={[styles.productCard, { borderColor: theme.line, backgroundColor: theme.soft, width: "48.8%" }]}><Icon name={target.icon} color={theme.primary}/><Text style={[styles.metricLabel, { marginTop: 8 }]}>{target.label}</Text><Text style={[styles.metricValue, { fontSize: 15 }]}>{target.value}</Text></View>)}</View></>}
      <WeightGraphic report={report} theme={theme}/>
      {report.narrative.nutritionAdvice && <NarrativePanel title="Nutrition guidance" text={report.narrative.nutritionAdvice} icon="food" theme={theme} accent/>}
      <ProductPlan report={report} theme={theme}/>
      {report.narrative.treatmentAdvice && <NarrativePanel title="During treatment" text={report.narrative.treatmentAdvice} icon="shield" theme={theme} soft/>}
    </ReportPage>}

    {(hasConsiderations || hasActions) && <ReportPage report={report} brand={brand} number={page++} title="Care and next steps" icon="heart">
      {report.narrative.conditionAdvice && <NarrativePanel title="Other health conditions" text={report.narrative.conditionAdvice} icon="heart" theme={theme} accent/>}
      {report.narrative.effectsAdvice && <NarrativePanel title="Treatment effects and nutrition" text={report.narrative.effectsAdvice} icon="drop" theme={theme} soft accent/>}
      {hasActions && <Text style={[styles.sectionLabel, { color: brandInk, marginTop: 5 }]}>Action plan and monitoring</Text>}
      {hasActions && <View style={[styles.row, { flexWrap: "wrap" }]}>
        {report.narrative.actionSummary && <CareStep number="01" title="What to do" text={report.narrative.actionSummary} icon="check" theme={theme} width={careStepWidth}/>}
        {report.narrative.monitoringSummary && <CareStep number="02" title="What to monitor" text={report.narrative.monitoringSummary} icon="chart" theme={theme} width={careStepWidth}/>}
      </View>}
      <View style={[styles.softPanel, { backgroundColor: "#fff7e9", borderWidth: 1, borderColor: "#f0d7a7", flexDirection: "row", gap: 10, alignItems: "center" }]}><Icon name="alert" color="#94611b"/><Text style={[styles.muted, { flex: 1, color: "#725325" }]}>Discuss new or worsening symptoms with the treating clinical team.</Text></View>
    </ReportPage>}
  </Document>;
}

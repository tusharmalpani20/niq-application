/** Display compatibility for reports saved with whole-sentence emphasis.
 * Only markdown markers change. The complete approved wording stays visible.
 * New reports retain their model's selections when these are already selective.
 */
const words = (text: string) => text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
type Span = { start: number; end: number; priority: number };

export function readableReportEmphasis(marked: string): string {
  const text = marked.replaceAll("**", "");
  if (!text.trim()) return text;
  const budget = Math.floor(words(text) * .35);
  const existing: Span[] = [];
  let removed = 0;
  for (const match of marked.matchAll(/\*\*([^*]+)\*\*/g)) {
    const start = match.index! - removed;
    existing.push({ start, end: start + match[1]!.length, priority: 5 });
    removed += 4;
  }
  const points = text.split(/(?<=\n)/u).flatMap((line, index, lines) => {
    const offset = lines.slice(0, index).join("").length;
    return Array.from(sentences.segment(line), segment => ({ text: segment.segment, start: offset + segment.index }));
  });
  const candidates: Span[] = [];
  const add = (start: number, end: number, priority: number) => {
    // Never make an affirmative-looking highlight out of a prohibited action.
    const negation = text.slice(0, start).match(/\b(?:do not|must not|never|don[’']t)\s+$/i);
    if (negation) start -= negation[0].length;
    const phrase = text.slice(start, end);
    if (words(phrase) < 2 || words(phrase) > 12 || /^\s|\s$/u.test(phrase)) return;
    if (/\b(?:small|fried|cool|bland|frequent|such as|such|or|and|with|your|the)$/i.test(phrase)) return;
    if (/^\d+(?:[.–-]\d+)?\s*(?:hours?|minutes?|weeks?)$/i.test(phrase)) return;
    if (start > 0 && /[\p{L}\p{N}/–-]/u.test(text[start - 1]!)) return;
    if (end < text.length && /[\p{L}\p{N}/–-]/u.test(text[end]!)) return;
    const point = points.find(item => start >= item.start && end <= item.start + item.text.length);
    if (!point || /^\s*#{1,6}\s/.test(point.text) || phrase === point.text.trim()) return;
    candidates.push({ start, end, priority });
  };
  // An intentionally unhighlighted model passage must remain unhighlighted.
  if (!existing.length) return marked;
  const existingWords = existing.reduce((sum, span) => sum + words(text.slice(span.start, span.end)), 0);
  if (existingWords <= budget) {
    for (const span of existing) add(span.start, span.end, span.priority);
    if (candidates.length === existing.length && existing.length) return marked;
  }
  const patterns: Array<[RegExp, number]> = [
    [/\b(?:contact|call|inform|notify)\s+(?:your|the)\s+(?:care team|oncologist|doctor)(?:\s+(?:immediately|early))?\b/gi, 4],
    [/\b(?:at least|below|above|under|over|more than|less than|about)\s+(?:\d+(?:[.\/–-]\d+)*|one|two|three|four)(?:\s*[–-]\s*\d+)?\s*(?:%|mg\/dL|mmHg|kg|g\/day|times(?:\s+(?:in|a)\s+(?:a\s+)?day)?|hours?|minutes?|loose stools(?:\s+above baseline)?)(?:\s+of\s+(?:energy|requirement))?/gi, 10],
    [/\b\d+(?:\.\d+)?(?:[–-]\d+(?:\.\d+)?)?\s*(?:%\s+of\s+energy|small meals|L\s+of\s+fluids\s+per\s+day|mg\/dL|mmHg|hours?|minutes?|weeks?)/gi, 9],
    [/\b(?:do not|must not|never|don[’']t)\s+(?:stop these tablets|restrict (?:protein|fluids(?: unless your care team advises you to)?)|wait|consume[^,.!?;]*)\b/gi, 11],
    [/\b(?:cannot keep fluids down|unable to eat or drink|fever or blood|diarrhea comes with dizziness|severe headache, chest pain, or vision changes|palpitations, a fast heart rate|leftovers older than 24 hours)\b/gi, 10],
    [/\b(?:replace fluid losses with ORS|small, frequent meals|low-residue soft foods|adequate protein and energy|sit upright for 30–60 minutes|blood pressure|TSH regularly)\b/gi, 8],
    [/\b(?:maintaining intake|maintain your intake|supporting intake|Early nutrition support|protect muscle|reduce fatigue|fluid target|diarrhea plan ready at home|oral rehydration solution\s*\(ORS\)|soft, moist, lukewarm or cool foods|bland salt-soda rinse after meals|blood pressure at home|weight and intake trends|weight trends|thyroid monitoring|your nutrition plan may need to be adapted|iron-rich foods|before taking supplements)\b/gi, 7],
    [/\b(?:weight (?:has increased|gain|loss)|nutritional status is (?:Moderately nourished|Well nourished|Severely malnourished))\b/gi, 7],
    [/\b(?:Choose|Avoid|Track|Record|Check|Maintain|Replace|Use|Keep|Follow|Try|Eat|Sip|Take|Repeat|Request|Include|Increase)\s+[^,.!?;:\n]+/g, 3],
  ];
  for (const [pattern, priority] of patterns) {
    for (const match of text.matchAll(pattern)) add(match.index!, match.index! + match[0].length, priority);
  }
  let remaining = budget;
  const selected: Span[] = [];
  const pointCounts = new Map<number, number>();
  for (const candidate of candidates.sort((a, b) => b.priority - a.priority || a.start - b.start)) {
    const count = words(text.slice(candidate.start, candidate.end));
    const point = points.findIndex(item => candidate.start >= item.start && candidate.end <= item.start + item.text.length);
    if (count > remaining || (pointCounts.get(point) ?? 0) >= 2
      || selected.some(span => candidate.start < span.end && candidate.end > span.start)) continue;
    selected.push(candidate);
    remaining -= count;
    pointCounts.set(point, (pointCounts.get(point) ?? 0) + 1);
  }
  let result = text;
  for (const { start, end } of selected.sort((a, b) => b.start - a.start))
    result = `${result.slice(0, start)}**${result.slice(start, end)}**${result.slice(end)}`;
  return result;
}

/** Suppress only a sentence that repeats both of the already visible targets. */
export function withoutRepeatedTargets(advice: string | undefined, targets: Array<{ value: string }>): string | undefined {
  if (!advice || targets.length < 2) return advice;
  const values = targets.map(target => target.value.replaceAll("**", "").replace(/\s/g, "").toLowerCase());
  return advice.replace(/(?:\*\*)?Aim for (.+?) for energy and (.+?) for protein\.(?:\*\*)?(?=\s*$|\s*\n)/g,
    (sentence, energy: string, protein: string) => {
      const supplied = [energy, protein].map(value => value.replaceAll("**", "").replace(/\s/g, "").toLowerCase());
      return values.every(value => supplied.includes(value)) ? "" : sentence;
    }).trim();
}

export function isSymptomCareReference(text: string): boolean {
  return /^(?:(?:For comfort,\s*)?see Reported symptom care|A related symptom was reported separately)\.?$/i.test(text.replaceAll("**", "").trim());
}

/** Legacy presentation only. Keep clinical qualifications and care instructions intact. */
export function patientReportedCare(text: string | undefined): string | undefined {
  return text?.replace(/(?:\*\*)?(?:Their cause is not established|The cause is unknown|It is unclear what caused (?:this|them)|The assessment does not establish that treatment caused them)\.(?:\*\*)?/gi, "").trim();
}

/** Tidy known fallback phrasing without rewriting authored summaries or clinical facts. */
export function readableClosingSummary(text: string, benefits: string[]): string {
  if (!/^Your reviewed nutrition risk is /i.test(text.replaceAll("**", "").trim())) return text;
  const plain = (value: string) => value.replaceAll("**", "").replace(/^\s*[•·]\s*/, "").trim().toLocaleLowerCase();
  const repeatedBenefits = new Set(benefits.map(plain));
  return text.split("\n").filter(line => !/^\s*[•·]/.test(line) || !repeatedBenefits.has(plain(line)))
    .map(line => line
      .replace(/^Your reviewed nutrition risk is (.+)\.$/i, (_, risk: string) => `Your NIQ assessment indicates ${risk.toLocaleLowerCase().replace(/\brisk\b/i, "nutritional risk")}.`)
      .replace(/^Your nutritional status is (.+)\.$/i, 'Your nutritional status is recorded as "$1".')
      .replace(/^The main nutrition priority is Early, preventive nutrition intervention to /, "Early nutrition support is recommended to help ")
      .replace(/^Your selected nutrition support is /, "Your nutrition plan includes "))
    .join("\n");
}

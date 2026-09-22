import { z } from "zod";
import type { AssessmentScoreResult } from "./assessment-workflow";
export const scoreReviewInputSchema = z.object({
  expectedResultReference: z.string().min(1).max(200),
  expectedRevision: z.number().int().nonnegative(), requestKey: z.string().min(16).max(128),
  targetType: z.enum(["item", "section", "overall", "scan"]), targetId: z.string().min(1).max(100).nullable(),
  points: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  reason: z.string().trim().min(1, "Enter a reason for this score change.").max(1000),
}).strict().refine(v => v.targetType === "overall" ? v.targetId === null : v.targetId !== null, { message: "Choose a valid score target." });
export type ScoreReviewInput = z.infer<typeof scoreReviewInputSchema>;
export type ScoreReviewEntry = {
  id: string; revision: number; targetType: "item" | "section" | "overall" | "scan"; targetId: string | null;
  previousPoints: number | null; points: number | null; reason: string | null;
  actorId: string; actorName: string; createdAt: string; resultReference: string;
};
export type ReviewedScore = { niqPoints: number | null; reviewedPoints: number | null; overridden: boolean };
export type AssessmentScoreReviews = {
  scan?: ReviewedScore & { id: string }; revision: number; canAdjust: boolean; entries: ScoreReviewEntry[]; overall: ReviewedScore;
  sections: Array<ReviewedScore & { id: string; items: Array<ReviewedScore & { id: string }> }>;
};
/** Explicit parent overrides persist until reset, even when an underlying item changes. */
export function projectScoreReviews(result: AssessmentScoreResult, entries: ScoreReviewEntry[], scan?: { id: string; points: number | null }): AssessmentScoreReviews {
  const overrides = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.targetType}:${entry.targetId ?? ""}`;
    if (entry.points === null) overrides.delete(key); else overrides.set(key, entry.points);
  }
  const value = (key: string, niqPoints: number | null, derived: number | null): ReviewedScore => ({niqPoints, reviewedPoints: overrides.get(key) ?? derived, overridden: overrides.has(key)});
  const sections = [...new Set(result.components.map(c => c.sectionId))].map(id => {
    const items = result.components.filter(c => c.sectionId === id).map(c => ({ id: c.id, ...value(`item:${c.id}`, c.points, c.points) }));
    const sum = (key: "niqPoints" | "reviewedPoints") => items.some(i => i[key] !== null) ? items.reduce((s, i) => s + (i[key] ?? 0), 0) : null;
    return { id, items, ...value(`section:${id}`, sum("niqPoints"), sum("reviewedPoints")) };
  });
  const total = sections.reduce((sum, section) => sum + (section.reviewedPoints ?? 0), 0);
  return { ...(scan ? { scan: { id: scan.id, ...value(`scan:${scan.id}`, scan.points, scan.points) } } : {}), revision: entries.at(-1)?.revision ?? 0, canAdjust: true, entries, sections, overall: value("overall:", result.score, total) };
}

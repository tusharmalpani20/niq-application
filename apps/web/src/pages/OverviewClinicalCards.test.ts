import { expect, test } from "bun:test";
import { summarizeAssessmentActivity } from "./OverviewClinicalCards";

const first = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const second = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const event = (id: string, assessmentId: string, action: "ASSESSMENT_CREATED" | "ASSESSMENT_SUBMITTED" | "CLINICAL_REVIEW_COMPLETE", date: Date) => ({ id, assessmentId, action, occurredAt: date });

test("activity summary keeps one occurrence of each action per assessment per local day", () => {
  const morning = new Date(2026, 8, 24, 9, 0);
  const evening = new Date(2026, 8, 24, 18, 0);
  const nextDay = new Date(2026, 8, 25, 9, 0);
  const items = [
    event(first, first, "ASSESSMENT_SUBMITTED", morning),
    event(second, first, "ASSESSMENT_SUBMITTED", evening),
    event(`${first.slice(0, -1)}X`, first, "ASSESSMENT_CREATED", morning),
    event(`${first.slice(0, -1)}Y`, second, "ASSESSMENT_SUBMITTED", morning),
    event(`${first.slice(0, -1)}Z`, first, "ASSESSMENT_SUBMITTED", nextDay),
  ];
  const summary = summarizeAssessmentActivity(items);
  expect(summary).toHaveLength(4);
  expect(summary.map(item => item.id)).not.toContain(first);
  expect(summary.find(item => item.id === second)?.occurredAt).toEqual(evening);
  expect(summary[0]?.occurredAt).toEqual(nextDay);
});

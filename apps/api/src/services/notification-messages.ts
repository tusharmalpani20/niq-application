/** One catalog supplies every delivery channel. Clinical details stay behind sign-in. */
export const notificationKinds = [
  "REVIEW_AVAILABLE", "REVIEW_ASSIGNED", "REVIEW_RETURNED", "CORRECTION_ASSIGNED",
  "REVIEW_COMPLETED", "OWNER_TRANSFERRED", "SCORING_FAILED", "SCAN_FAILED",
] as const;
export type NotificationKind = typeof notificationKinds[number];

type Message = { title: string; body: string };
type Template = { inApp: (reference: string) => Message; push: Message };

const templates: Record<NotificationKind, Template> = {
  REVIEW_AVAILABLE: {
    inApp: reference => ({ title: "Review available", body: `${reference} is ready for clinical review.` }),
    push: { title: "Review available", body: "A clinical review is ready in NIQ." },
  },
  REVIEW_ASSIGNED: {
    inApp: reference => ({ title: "Review assigned to you", body: `${reference} is ready for your review.` }),
    push: { title: "Review assigned", body: "You have a clinical review in NIQ." },
  },
  REVIEW_RETURNED: {
    inApp: reference => ({ title: "Corrections requested", body: `${reference} was returned for correction.` }),
    push: { title: "Corrections requested", body: "An assessment needs your attention in NIQ." },
  },
  CORRECTION_ASSIGNED: {
    inApp: reference => ({ title: "Corrections assigned to you", body: `${reference} needs your corrections.` }),
    push: { title: "Corrections assigned", body: "An assessment needs your attention in NIQ." },
  },
  REVIEW_COMPLETED: {
    inApp: reference => ({ title: "Review completed", body: `Clinical review of ${reference} is complete.` }),
    push: { title: "Review completed", body: "A clinical review is complete in NIQ." },
  },
  OWNER_TRANSFERRED: {
    inApp: reference => ({ title: "Assessment assigned to you", body: `${reference} is now assigned to you.` }),
    push: { title: "Assessment assigned", body: "You have an assessment to work on in NIQ." },
  },
  SCORING_FAILED: {
    inApp: reference => ({ title: "Scoring needs attention", body: `Scoring for ${reference} could not be completed.` }),
    push: { title: "Scoring needs attention", body: "An assessment needs your attention in NIQ." },
  },
  SCAN_FAILED: {
    inApp: reference => ({ title: "Vital IQ needs attention", body: `The Vital IQ measurement for ${reference} needs attention.` }),
    push: { title: "Vital IQ needs attention", body: "An assessment needs your attention in NIQ." },
  },
};

export function notificationMessage(kind: NotificationKind, channel: "inApp" | "push", reference: string): Message {
  return channel === "push" ? templates[kind].push : templates[kind].inApp(reference);
}

import { useEffect, useRef, useState } from "react";
import { membershipRoleLabels, type ClinicalReview, type ClinicalReviewAction, type ClinicalReviewEvent, type ClinicalReviewer } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchCombobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedFormClose } from "@/components/useUnsavedFormClose";
import { changeClinicalReview, clinicalActionLabels, clinicalReviewLabels, getClinicalReviewers } from "./clinical-review-api";
import { AssessmentRequestError } from "./workflow-api";

type Action = ClinicalReviewAction["action"];
export const recipientActions: Action[] = ["TRANSFER", "RETURN_TO_DRAFT", "REASSIGN_CORRECTION"];
const noteActions: Action[] = [...recipientActions, "RELEASE", "COMPLETE"];
function previouslySent(review: ClinicalReview) {
  return !!review.submittedAt || review.history.some(event => event.action === "SEND" || event.action === "RESEND");
}
function actionLabel(action: Action, review: ClinicalReview) {
  if (action === "RESEND" && !previouslySent(review)) return clinicalActionLabels.SEND;
  return action === "TRANSFER" && !review.assignee ? "Assign reviewer" : clinicalActionLabels[action];
}
function reviewStatusLabel(review: ClinicalReview) {
  if (review.state === "AWAITING_RESUBMISSION") return previouslySent(review) ? "Ready to resend for clinical review" : "Ready to send for clinical review";
  return clinicalReviewLabels[review.state];
}
function historyLabel(event: ClinicalReviewEvent, history: ClinicalReviewEvent[]) {
  if (event.action === "RESEND" && !history.some(prior => prior.revision < event.revision && (prior.action === "SEND" || prior.action === "RESEND"))) return "Sent for clinical review";
  const labels: Record<Action, string> = {
    SEND: "Sent for clinical review", CLAIM: "Claimed review", TRANSFER: "Transferred review",
    RELEASE: "Released to queue", RETURN_TO_DRAFT: "Returned for correction",
    REASSIGN_CORRECTION: "Reassigned corrections", RESEND: "Resent for clinical review", COMPLETE: "Completed review",
  };
  return labels[event.action];
}
function ReviewHistoryEvent({ event, history }: { event: ClinicalReviewEvent; history: ClinicalReviewEvent[] }) {
  const assignmentLabel = event.action === "RETURN_TO_DRAFT" || event.action === "REASSIGN_CORRECTION" ? "Corrections assigned to" : event.action === "TRANSFER" ? "Reviewer assigned" : null;
  return <li className="relative border-l-2 border-border py-3 pl-5 text-sm first:pt-1 last:pb-1">
    <span aria-hidden className="absolute -left-[5px] top-4 size-2 rounded-full bg-primary" />
    <p className="font-medium">{historyLabel(event, history)}</p>
    <p className="mt-1 text-xs text-muted-foreground"><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time><span className="mx-1.5">·</span>Cycle {event.cycle}<span className="mx-1.5">·</span>by {event.actor.displayName}</p>
    {assignmentLabel && event.assignee && <p className="mt-1 text-muted-foreground">{assignmentLabel}: {event.assignee.displayName}</p>}
    {event.reason && <p className="mt-2 whitespace-pre-wrap break-words"><span className="font-medium">Reason:</span> {event.reason}</p>}
    {event.remark && <p className="mt-2 whitespace-pre-wrap break-words"><span className="font-medium">Final remark:</span> {event.remark}</p>}
  </li>;
}
function ReviewHistory({ history }: { history: ClinicalReviewEvent[] }) {
  if (!history.length) return null;
  return <details className="mt-4 border-t border-border pt-3">
    <summary className="min-h-11 cursor-pointer font-medium">Review history ({history.length})</summary>
    <ol className="mt-2">{[...history].reverse().map(event => <ReviewHistoryEvent key={event.id} event={event} history={history} />)}</ol>
  </details>;
}
export function ClinicalReviewPanel({ organizationId, assessmentId, review, error, loading, blocked, onRefresh, onChanged, onBusyChange }: {
  organizationId: string; assessmentId: string; review: ClinicalReview | null; error: string; loading: boolean; blocked: boolean;
  onRefresh: () => Promise<unknown>; onChanged: () => Promise<unknown>; onBusyChange: (busy: boolean) => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  return <section aria-label="Clinical review" className="my-5 rounded-xl border border-border bg-card p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl">Clinical review</h2>{review && <span className="text-sm text-muted-foreground">{reviewStatusLabel(review)}</span>}</div>
    {loading && <p className="mt-3 text-sm" role="status">Loading review…</p>}
    {error && <div role="alert" className="mt-3 text-sm text-destructive">{error}<Button variant="link" isDisabled={blocked || loading} onPress={() => { void onRefresh(); }}>Reload review</Button></div>}
    {review && <>
      {review.assignee && <p className="mt-3 text-sm">Reviewer: {review.assignee.displayName}</p>}
      {review.correctionPerson && review.state !== "AWAITING_RESUBMISSION" && <p className="mt-3 text-sm">Corrections assigned to: {review.correctionPerson.displayName}</p>}
      {review.returnReason && review.state === "RETURNED" && <div className="mt-3 rounded-lg bg-muted p-3 text-sm"><p>Return reason</p><p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{review.returnReason}</p></div>}
      {review.state === "NOT_SUBMITTED" && <p className="mt-3 text-sm text-muted-foreground">The original assessment creator can send the scored assessment for clinical review.</p>}
      {review.state === "QUEUED" && <p className="mt-3 text-sm text-muted-foreground">An eligible clinician can claim this review.</p>}
      {review.state === "RETURNED" && <p className="mt-3 text-sm text-muted-foreground">The clinician assigned to corrections updates the questionnaire, requests a new score, then {previouslySent(review) ? "resends" : "sends"} it for clinical review.</p>}
      {review.state === "AWAITING_RESUBMISSION" && <p className="mt-3 text-sm text-muted-foreground">Scoring is complete. {review.correctionPerson?.displayName ?? "The clinician assigned to corrections"} can {previouslySent(review) ? "resend" : "send"} this assessment {previouslySent(review) ? "to the previous reviewer if eligible, or to the queue" : "to the clinical review queue"}.</p>}
      {review.state === "COMPLETED" && <div className="mt-3 text-sm"><p>This review is final and cannot be reopened.</p>{review.finalRemark && <p className="mt-2 whitespace-pre-wrap break-words">{review.finalRemark}</p>}</div>}
      {review.riskClassificationPending && <p className="mt-3 text-sm text-muted-foreground">NIQ must confirm the current reviewed risk before this review can be completed. Check the assessment summary below.</p>}
      {blocked && !!review.allowedActions?.length && <p className="mt-3 text-sm text-muted-foreground">Finish or cancel your current changes before changing the review workflow.</p>}
      <div className="mt-4 flex flex-wrap gap-2">{review.allowedActions?.map(next => <Button key={next} variant={["SEND", "CLAIM", "RESEND", "COMPLETE"].includes(next) ? "default" : "outline"} isDisabled={blocked || loading || !!error || !!action || (next === "COMPLETE" && review.riskClassificationPending === true)} onPress={() => setAction(next)}>{actionLabel(next, review)}</Button>)}</div>
      {!!review.history?.length && <ReviewHistory history={review.history} />}
      {action && <ClinicalReviewCommandDialog key={action} action={action} review={review} organizationId={organizationId} assessmentId={assessmentId} blocked={blocked || loading || !!error || (action === "COMPLETE" && review.riskClassificationPending === true)} onClose={() => setAction(null)} onChanged={onChanged} onRefresh={onRefresh} onBusyChange={onBusyChange} />}
    </>}
  </section>;
}

export function ClinicalReviewCommandDialog({ action, review, organizationId, assessmentId, blocked, onClose, onChanged, onRefresh, onBusyChange }: {
  action: Action; review: ClinicalReview; organizationId: string; assessmentId: string; blocked: boolean; onClose: () => void;
  onChanged: () => Promise<unknown>; onRefresh: () => Promise<unknown>; onBusyChange: (busy: boolean) => void;
}) {
  const needsRecipient = recipientActions.includes(action);
  const needsNote = noteActions.includes(action);
  const [recipients, setRecipients] = useState<ClinicalReviewer[]>([]);
  const [recipient, setRecipient] = useState<string | null>(null);
  const initialRecipient = useRef<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(needsRecipient);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    if (!needsRecipient) return;
    const controller = new AbortController(); setLoading(true);
    getClinicalReviewers(organizationId, assessmentId, controller.signal).then(items => {
      if (controller.signal.aborted) return;
      const current = action === "REASSIGN_CORRECTION" ? review.correctionPerson?.membershipId : action === "TRANSFER" ? review.assignee?.membershipId : undefined;
      const eligible = items.filter(item => item.membershipId !== current);
      setRecipients(eligible); setError("");
      const defaultRecipient = action === "RETURN_TO_DRAFT" && eligible.some(item => item.membershipId === review.defaultCorrectionPersonId) ? review.defaultCorrectionPersonId : null;
      initialRecipient.current = defaultRecipient;
      setRecipient(value => eligible.some(item => item.membershipId === value) ? value : defaultRecipient);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load eligible people."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [organizationId, assessmentId, action, needsRecipient, review.defaultCorrectionPersonId, review.correctionPerson?.membershipId, review.assignee?.membershipId, retry]);
  const { requestClose, confirmation } = useUnsavedFormClose({ subject: "review", isDirty: () => !!note || recipient !== initialRecipient.current, isBusy: () => inFlight.current, onClose });
  async function submit() {
    if (inFlight.current || blocked || loading || conflict || !review.allowedActions.includes(action)) return;
    if (needsNote && !note.trim()) { setError(action === "COMPLETE" ? "Enter a final remark." : "Enter a reason."); return; }
    if (needsRecipient && !recipients.some(item => item.membershipId === recipient)) { setError("Choose an eligible person."); return; }
    const body = { action, expectedRevision: review.revision, expectedScoreRevision: review.scoreRevision,
      ...(needsRecipient ? { assigneeId: recipient! } : {}), ...(needsNote ? action === "COMPLETE" ? { remark: note.trim() } : { reason: note.trim() } : {}) };
    const fingerprint = JSON.stringify(body);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); onBusyChange(true); setError("");
    try {
      await changeClinicalReview(organizationId, assessmentId, { ...body, requestKey: request.current.key } as ClinicalReviewAction);
      await onChanged(); onClose();
    } catch (cause) {
      if (cause instanceof AssessmentRequestError && [403, 409].includes(cause.status)) { setConflict(true); setError("This review or your access has changed. Reload the review before continuing. Your entered details are preserved."); }
      else setError(cause instanceof Error ? cause.message : "Could not update the review. Your details are preserved; try again.");
    } finally { inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  return <><Dialog isOpen isDismissable={!busy} showCloseButton={!busy} onOpenChange={open => { if (!open) requestClose(); }} ariaLabel={actionLabel(action, review)} className="facility-dialog">
    <DialogHeader><DialogTitle>{actionLabel(action, review)}</DialogTitle></DialogHeader>
    <form className="clinical-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="form-fields facility-dialog-fields min-h-0 overflow-y-auto">
        <p className="text-sm text-muted-foreground">{action === "COMPLETE" ? "Complete this clinical review with a final remark. Completion is permanent; the assessment cannot be reopened or edited." : action === "RETURN_TO_DRAFT" ? "Return this assessment for corrections and a new score. Existing submitted answers, results and adjustments stay in history." : action === "RELEASE" ? "Release ownership so another eligible clinician can claim the review. Saved work stays in history." : action === "RESEND" ? (previouslySent(review) ? "Resend to the previous reviewer if they remain eligible, otherwise to the unclaimed queue." : "Send this scored assessment to the clinical review queue.") : action === "SEND" ? "Send this scored assessment to the clinical review queue." : action === "CLAIM" ? "You will become responsible for this clinical review." : "The selected person will become responsible immediately. This change is recorded in review history."}</p>
        {needsRecipient && <div className="grid gap-2"><label htmlFor="clinical-review-recipient">{action === "TRANSFER" ? "Reviewer" : "Assign corrections to"} *</label><SearchCombobox id="clinical-review-recipient" label={action === "TRANSFER" ? "Reviewer" : "Assign corrections to"} value={recipient} onChange={setRecipient} options={recipients.map(item => ({ id: item.membershipId, label: `${item.displayName} · ${membershipRoleLabels[item.role]}` }))} required disabled={busy || loading || conflict} placeholder="Search or select a person…" />{loading ? <p role="status" className="text-sm">Loading eligible people…</p> : !recipients.length && <p className="text-sm">No eligible people are available. An administrator needs to check clinical roles and facility access.</p>}</div>}
        {needsNote && <label className="grid gap-2">{action === "COMPLETE" ? "Final remark" : "Reason"} *<Textarea value={note} onChange={event => setNote(event.target.value)} required maxLength={4000} disabled={busy || conflict} /></label>}
        {error && <div role="alert" className="text-sm text-destructive">{error}{conflict ? <Button variant="link" isDisabled={busy} onPress={async () => { const fresh = await onRefresh(); if (fresh) { setConflict(false); setError(""); setRetry(value => value + 1); } }}>Reload review</Button> : needsRecipient && !recipients.length && <Button variant="link" onPress={() => setRetry(value => value + 1)}>Retry loading people</Button>}</div>}
      </div>
      <footer className="form-footer"><Button variant="outline" isDisabled={busy} onPress={requestClose}>Cancel</Button><Button type="submit" isDisabled={busy || blocked || loading || conflict || !review.allowedActions.includes(action) || (needsNote && !note.trim()) || (needsRecipient && !recipient)}>{busy ? "Saving…" : actionLabel(action, review)}</Button></footer>
    </form>
  </Dialog>{confirmation}</>;
}

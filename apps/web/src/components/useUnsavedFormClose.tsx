import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

/** Read current values on every dismissal, including browser-autofilled inputs. */
export function hasChangedInputs(form: HTMLFormElement | null): boolean {
  return !!form && [...form.querySelectorAll<HTMLInputElement>("input")].some(input =>
    !["hidden", "submit", "button", "checkbox", "radio"].includes(input.type) && !input.readOnly && input.value !== input.defaultValue);
}

export function useUnsavedFormClose({ isDirty, isBusy, onClose, subject }: {
  isDirty: () => boolean; isBusy: () => boolean; onClose: () => void; subject: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);
  function requestCloseWith(action: () => void) {
    if (isBusy()) return;
    if (isDirty()) { setPendingClose(() => action); setConfirm(true); }
    else action();
  }
  function requestClose() { requestCloseWith(onClose); }
  function dismissConfirmation() { setConfirm(false); setPendingClose(null); }
  const confirmation = <Dialog isOpen={confirm} onOpenChange={open => { if (!open) dismissConfirmation(); }} ariaLabel={`Discard ${subject} changes?`}>
    <DialogHeader><DialogTitle>Discard {subject} changes?</DialogTitle><DialogDescription>The details you entered have not been saved. Leaving will discard your changes.</DialogDescription></DialogHeader>
    <DialogFooter><Button variant="outline" autoFocus onPress={dismissConfirmation}>Keep editing</Button><Button variant="destructive" onPress={() => { if (!isBusy()) { const action = pendingClose ?? onClose; dismissConfirmation(); action(); } }}>Discard changes</Button></DialogFooter>
  </Dialog>;
  return { requestClose, requestCloseWith, confirmation };
}

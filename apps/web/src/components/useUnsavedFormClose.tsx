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
  function requestClose() {
    if (isBusy()) return;
    if (isDirty()) setConfirm(true);
    else onClose();
  }
  const confirmation = <Dialog isOpen={confirm} onOpenChange={setConfirm} ariaLabel={`Discard ${subject} changes?`}>
    <DialogHeader><DialogTitle>Discard {subject} changes?</DialogTitle><DialogDescription>The details you entered have not been saved. Leaving will discard your changes.</DialogDescription></DialogHeader>
    <DialogFooter><Button variant="outline" autoFocus onPress={() => setConfirm(false)}>Keep editing</Button><Button variant="destructive" onPress={() => { if (!isBusy()) { setConfirm(false); onClose(); } }}>Discard changes</Button></DialogFooter>
  </Dialog>;
  return { requestClose, confirmation };
}

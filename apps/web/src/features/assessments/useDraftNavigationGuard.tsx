import { useEffect, useRef, useState } from "react";
import { useBlocker, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

/** Browser unload, router Back/links, and the shell's sign-out action share one guard. */
export function useDraftNavigationGuard(dirty: boolean) {
  const allowNext = useRef(false);
  const { pathname } = useLocation();
  const [shellProceed, setShellProceed] = useState<(() => void) | null>(null);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (currentLocation.pathname === nextLocation.pathname) return false;
    if (allowNext.current) { allowNext.current = false; return false; }
    return dirty;
  });
  useEffect(() => {
    function unload(event: BeforeUnloadEvent) { if (dirty) { event.preventDefault(); event.returnValue = ""; } }
    function shellNavigation(event: Event) {
      if (!dirty) return;
      const detail = (event as CustomEvent<{ proceed?: () => void; to?: string }>).detail;
      if (detail?.to === pathname) return;
      event.preventDefault();
      if (detail?.proceed) setShellProceed(() => detail.proceed!);
    }
    window.addEventListener("beforeunload", unload);
    window.addEventListener("niq:before-navigation", shellNavigation);
    return () => { window.removeEventListener("beforeunload", unload); window.removeEventListener("niq:before-navigation", shellNavigation); };
  }, [dirty, pathname]);
  function stay() {
    setShellProceed(null);
    if (blocker.state === "blocked") blocker.reset();
  }
  function leave() {
    if (shellProceed) {
      allowNext.current = true;
      setShellProceed(null);
      shellProceed();
    } else if (blocker.state === "blocked") blocker.proceed();
  }
  return <Dialog isOpen={blocker.state === "blocked" || shellProceed !== null} onOpenChange={open => { if (!open) stay(); }}>
    <DialogTitle>Leave this assessment?</DialogTitle>
    <DialogDescription>Your unsaved changes will be lost. Stay to save your draft before leaving.</DialogDescription>
    <DialogFooter>
      <Button variant="outline" autoFocus onPress={stay}>Stay on assessment</Button>
      <Button variant="destructive" onPress={leave}>Leave without saving</Button>
    </DialogFooter>
  </Dialog>;
}

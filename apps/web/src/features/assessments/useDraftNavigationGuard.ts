import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

/** Browser unload, router Back/links, and the shell's sign-out action share one guard. */
export function useDraftNavigationGuard(dirty: boolean) {
  const allowNext = useRef(false);
  const blocker = useBlocker(() => {
    if (allowNext.current) { allowNext.current = false; return false; }
    return dirty;
  });
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Leave this assessment? Unsaved changes will be lost.")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    function unload(event: BeforeUnloadEvent) { if (dirty) { event.preventDefault(); event.returnValue = ""; } }
    function shellNavigation(event: Event) {
      if (!dirty) return;
      if (!window.confirm("Leave this assessment? Unsaved changes will be lost.")) event.preventDefault();
      else allowNext.current = true;
    }
    window.addEventListener("beforeunload", unload);
    window.addEventListener("niq:before-navigation", shellNavigation);
    return () => { window.removeEventListener("beforeunload", unload); window.removeEventListener("niq:before-navigation", shellNavigation); };
  }, [dirty]);
}

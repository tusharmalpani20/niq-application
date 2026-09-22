import { useCallback, useEffect, useRef, useState } from "react";
import type { ClinicalReview } from "@niq/application-contracts";
import { getClinicalReview } from "./clinical-review-api";

export function useClinicalReview(organizationId: string, assessmentId: string | undefined) {
  const [review, setReview] = useState<ClinicalReview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!assessmentId) return;
    const current = ++sequence.current;
    setLoading(true);
    try {
      const next = await getClinicalReview(organizationId, assessmentId);
      if (current === sequence.current) { setReview(next); setError(""); }
      return next;
    } catch (cause) {
      if (current === sequence.current) { setError(cause instanceof Error ? cause.message : "Clinical review could not be loaded."); }
    } finally { if (current === sequence.current) setLoading(false); }
  }, [organizationId, assessmentId]);
  useEffect(() => { setReview(null); void refresh(); return () => { sequence.current++; }; }, [refresh]);
  return { review, error, loading, refresh };
}

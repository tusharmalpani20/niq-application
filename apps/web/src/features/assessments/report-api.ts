import { apiErrorSchema, reportInputSchema, type AssessmentWorkflow } from "@niq/application-contracts";
export type ReportInput = ReturnType<typeof reportInputSchema.parse>;
export function reportBase(organizationId: string, assessmentId: string) {
  return `/api/v1/organizations/${encodeURIComponent(organizationId)}/assessments/${encodeURIComponent(assessmentId)}/reports`;
}
function failure(body: unknown) {
  const parsed = apiErrorSchema.safeParse(body);
  return new Error(parsed.success ? parsed.data.error.message : "The request could not be confirmed. Refresh before trying again.");
}
export async function mutateReport(url: string, method: "POST" | "PATCH" | "DELETE", input?: ReportInput): Promise<void> {
  const response = await fetch(url, { method, credentials: "include", headers: input ? { "content-type": "application/json" } : undefined, body: input ? JSON.stringify(reportInputSchema.parse(input)) : undefined });
  if (!response.ok) throw failure(await response.json().catch(() => null));
}
export function uploadReportFile(input: {
  url: string; file: File; requestKey: string; revision: number; signal: AbortSignal; onProgress: (percent: number) => void;
}): Promise<AssessmentWorkflow> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => input.signal.removeEventListener("abort", abort);
    xhr.open("POST", input.url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("content-type", input.file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upload-key", input.requestKey);
    xhr.setRequestHeader("x-file-name", encodeURIComponent(input.file.name));
    xhr.setRequestHeader("x-assessment-revision", String(input.revision));
    xhr.upload.onprogress = event => { if (event.lengthComputable) input.onProgress(Math.min(99, Math.floor(event.loaded / event.total * 100))); };
    xhr.onload = () => {
      cleanup();
      let body: unknown;
      try { body = JSON.parse(xhr.responseText); } catch { reject(failure(null)); return; }
      if (xhr.status < 200 || xhr.status >= 300) reject(failure(body));
      else { input.onProgress(100); resolve(body as AssessmentWorkflow); }
    };
    xhr.onerror = () => { cleanup(); reject(new Error("Upload could not be confirmed. Retry will use the same upload reference.")); };
    xhr.onabort = () => { cleanup(); reject(new Error("Upload cancelled. Check saved files before retrying.")); };
    input.signal.addEventListener("abort", abort, { once: true });
    if (input.signal.aborted) { cleanup(); reject(new Error("Upload cancelled.")); return; }
    xhr.send(input.file);
  });
}

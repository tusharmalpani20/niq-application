import { afterEach, expect, test } from "bun:test";
import { uploadReportFile } from "./report-api";
const originalXHR = globalThis.XMLHttpRequest;
class FakeXHR {
  static requests: FakeXHR[] = [];
  headers = new Map<string, string>();
  upload = {} as XMLHttpRequestUpload;
  withCredentials = false;
  status = 200;
  responseText = "{}";
  onload?: () => void; onerror?: () => void; onabort?: () => void;
  open() { FakeXHR.requests.push(this); }
  setRequestHeader(key: string, value: string) { this.headers.set(key, value); }
  send() {}
  abort() { this.onabort?.(); }
}
afterEach(() => { globalThis.XMLHttpRequest = originalXHR; FakeXHR.requests = []; });
const setup = () => { globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest; };
const request = (signal: AbortSignal, onProgress = (_: number) => {}) => uploadReportFile({ url: "/scoped/files", file: new File(["pdf"], "blood report.pdf", { type: "application/pdf" }), requestKey: "durable-key", revision: 4, signal, onProgress });
test("retry retains upload identity after cancellation", async () => {
  setup();
  const abort = new AbortController();
  const first = request(abort.signal);
  await new Promise(resolve => setTimeout(resolve, 10));
  abort.abort();
  await expect(first).rejects.toThrow("cancelled");
  const retry = request(new AbortController().signal);
  await new Promise(resolve => setTimeout(resolve, 10));
  const xhr = FakeXHR.requests[1]!;
  expect(xhr.headers.get("x-upload-key")).toBe(FakeXHR.requests[0]!.headers.get("x-upload-key"));
  expect(xhr.headers.get("x-file-name")).toBe("blood%20report.pdf");
  expect(xhr.headers.get("x-assessment-revision")).toBe("4");
  expect(xhr.withCredentials).toBe(true);
  expect(xhr.headers.get("x-file-sha256")).toMatch(/^[a-f0-9]{64}$/);
  xhr.onload?.();
  await retry;
});
test("bytes sent is not presented as upload completion until server confirms", async () => {
  setup();
  const progress: number[] = [];
  const pending = request(new AbortController().signal, value => progress.push(value));
  await new Promise(resolve => setTimeout(resolve, 10));
  const xhr = FakeXHR.requests[0]!;
  xhr.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 3 } as ProgressEvent);
  expect(progress).toEqual([99]);
  xhr.onerror?.();
  await expect(pending).rejects.toThrow("could not be confirmed");
  expect(progress).not.toContain(100);
});

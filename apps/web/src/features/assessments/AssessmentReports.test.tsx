import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AssessmentReports } from "./AssessmentReports";

test("reports shows the configured per-file limit", () => {
  const html = renderToStaticMarkup(<AssessmentReports organizationId="org" assessmentId="assessment" reports={[]} revision={0} onChanged={async () => {}} limits={{ fileBytes: 3 * 1024 * 1024, filesPerReport: 2, reportsPerAssessment: 4, assessmentBytes: 12 * 1024 * 1024 }}/>);
  expect(html).toContain("Up to 3 MB per file");
  expect(html).toContain("No attachments yet");
  expect(html).toContain("Create a report and choose its files in one step.");
  expect(html).not.toContain("10 MB");
});

test("report cards retain download and labelled removal controls in a compact group", () => {
  const html = renderToStaticMarkup(<AssessmentReports organizationId="org" assessmentId="assessment" revision={2} onChanged={async () => {}} reports={[{
    id: "report-1", label: "Blood test", purpose: "Before treatment", datePrecision: "MONTH", year: 2026, month: 8, day: null,
    files: [{ id: "file-1", reportId: "report-1", originalFilename: "CBC.pdf", mediaType: "application/pdf", size: 1000, status: "READY", createdAt: "2026-08-01" }],
  }]}/>);
  expect(html).toContain("Report 1");
  expect(html).toContain("Report name");
  expect(html).toContain("Purpose");
  expect(html).toContain("Date on report");
  expect(html).toContain("Before treatment");
  expect(html).toContain("Month and year");
  expect(html).toContain("2026-08");
  expect(html).toContain('aria-label="Remove CBC.pdf"');
  expect(html).toContain('aria-label="Add files to report 1"');
  expect(html).toContain("Add another report");
  expect(html).not.toContain("<h2");
});

test("read-only report cards have no mutation controls", () => {
  const html = renderToStaticMarkup(<AssessmentReports organizationId="org" assessmentId="assessment" revision={0} readOnly onChanged={async () => {}} reports={[]}/>);
  expect(html).not.toContain('data-slot="button"');
  expect(html).not.toContain('type="file"');
});

test("creating a report uploads selected files using each saved revision", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
  const keys = ["FocusEvent", "window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "HTMLButtonElement", "HTMLInputElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch", "XMLHttpRequest"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = { FocusEvent: dom.window.FocusEvent, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  const revisions: string[] = [];
  class SavedXHR {
    upload = {} as XMLHttpRequestUpload;
    status = 200;
    responseText = "";
    onload?: () => void;
    open(method: string, url: string) { expect(method).toBe("POST"); expect(url).toContain("/created-report/files"); }
    setRequestHeader(key: string, value: string) { if (key === "x-assessment-revision") revisions.push(value); }
    send() { this.responseText = JSON.stringify({ revision: Number(revisions.at(-1)) + 1 }); queueMicrotask(() => this.onload?.()); }
    abort() {}
  }
  globalThis.XMLHttpRequest = SavedXHR as unknown as typeof XMLHttpRequest;
  let creates = 0;
  globalThis.fetch = (async (_url, init) => {
    creates++;
    expect(init?.method).toBe("POST");
    return Response.json({ revision: 4, reports: [{ id: "created-report", files: [] }] });
  }) as typeof fetch;
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<AssessmentReports organizationId="org" assessmentId="assessment" reports={[]} revision={3} onChanged={async () => {}}/>); });
    await act(async () => { [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Add report"))!.click(); });
    const name = document.querySelector<HTMLInputElement>("#report-label")!;
    expect(name.required).toBe(true);
    await act(async () => { name.closest("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    expect(creates).toBe(0);
    expect(document.body.textContent).toContain("Enter a report name.");
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(name, "Blood test results");
      name.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      name.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      name.dispatchEvent(new dom.window.KeyboardEvent("keyup", { bubbles: true, key: "s" }));
    });
    const input = document.querySelector('input[aria-label="Choose files for new report"]') as HTMLInputElement;
    const files = [new File(["first"], "first.pdf", { type: "application/pdf" }), new File(["second"], "second.pdf", { type: "application/pdf" })];
    Object.defineProperty(input, "files", { configurable: true, value: files });
    await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    expect(document.body.textContent).toContain("Create and upload");
    await act(async () => { input.closest("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(revisions).toEqual(["4", "5"]);
    expect(creates).toBe(1);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  }
});

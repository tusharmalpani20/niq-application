import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { initializeMonitoring, captureReactError } from "./monitoring";

test("React boundary failures reach the real browser SDK without patient or page data", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://app.example/assessments/PRIVATE_ASSESSMENT?token=PRIVATE_TOKEN" });
  const keys = ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const envelopes: unknown[] = [];
  const transport = () => ({ send: async (envelope: unknown) => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true });
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    initializeMonitoring({ MODE: "test", VITE_SENTRY_DSN: "https://public@example.com/1" }, transport);
    expect(envelopes).toHaveLength(0);
    initializeMonitoring({ MODE: "development", VITE_SENTRY_DSN: "https://public@example.com/1" }, transport);
    Sentry.setUser({ email: "PRIVATE_PATIENT@example.com", ip_address: "192.0.2.1" });
    Sentry.setExtra("assessment", { diagnosis: "PRIVATE_DIAGNOSIS" });
    const options = Sentry.getClient()!.getOptions();
    expect(options.tracesSampleRate).toBe(0);
    expect(options.maxBreadcrumbs).toBe(0);
    for (const name of ["Breadcrumbs", "BrowserTracing", "Replay", "HttpContext"])
      expect(Sentry.getClient()!.getIntegrationByName(name)).toBeUndefined();
    class Boundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      render() { return this.state.failed ? <p>Unable to display this section.</p> : this.props.children; }
    }
    function Broken(): React.ReactNode { throw new Error("PRIVATE_PATIENT PRIVATE_DIAGNOSIS PRIVATE_TOKEN"); }
    root = createRoot(dom.window.document.getElementById("root")!, { onCaughtError: captureReactError, onUncaughtError: captureReactError });
    await act(async () => root!.render(<Boundary><Broken /></Boundary>));
    await Sentry.flush(1000);
    expect(dom.window.document.body.textContent).toContain("Unable to display this section");
    expect(envelopes).toHaveLength(1);
    const sent = JSON.stringify(envelopes);
    expect(sent).toContain("browser_error");
    for (const secret of ["PRIVATE_", "192.0.2.1", "diagnosis", "assessments/"])
      expect(sent).not.toContain(secret);
  } finally {
    if (root) await act(async () => root!.unmount());
    await Sentry.close(1000);
    dom.window.close();
    for (const key of keys) {
      const descriptor = previous[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

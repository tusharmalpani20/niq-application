import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ReportToxicityPicker } from "./ReportToxicityPicker";

test("clinician effects start unselected and can be chosen explicitly", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  const previous = Object.fromEntries(["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const root = createRoot(document.getElementById("root")!);
  const choices: Array<[string, boolean]> = [];
  const props = {
    options: [{ id: "toxicity_1", classId: "taxanes", classLabel: "Taxanes", treatmentTypeId: "chemotherapy", treatmentTypeLabel: "Chemotherapy", expectedToxicity: "Fluid retention" }],
    selectedIds: [], loading: false, error: "", disabled: false,
    onToggle: (id: string, selected: boolean) => choices.push([id, selected]),
    onRetry: () => {},
  };
  try {
    await act(async () => root.render(<ReportToxicityPicker {...props}/>));
    const checkbox = document.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(document.body.textContent).toContain("Chemotherapy · Taxanes");
    expect(document.body.textContent).toContain("Fluid retention");
    await act(async () => checkbox.click());
    expect(choices).toEqual([["toxicity_1", true]]);
    await act(async () => root.render(<ReportToxicityPicker {...props} selectedIds={["toxicity_1"]}/>));
    expect((document.querySelector("input[type='checkbox']") as HTMLInputElement).checked).toBe(true);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});

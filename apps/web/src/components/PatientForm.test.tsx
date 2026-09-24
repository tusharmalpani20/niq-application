import { UserInvitationDialog } from "./UserInvitationDialog";
import { UserEditDialog } from "./UserEditDialog";
import { FacilityDialog } from "../pages/FacilitiesPage";
import type { AuthenticatedUser, OrganizationUser } from "@niq/application-contracts";
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PatientForm, PatientFormDialog } from "./PatientForm";

const facility = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FAX", name: "Central", code: "CTR", status: "INACTIVE" as const, timezone: "Asia/Kolkata", createdAt: new Date(), updatedAt: new Date() };
const patient = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", organizationId: facility.organizationId, reference: "PAT-2", displayName: "Patient Name", medicalRecordNumber: "MRN-2", homeFacility: { id: facility.id, name: facility.name }, dateOfBirth: "1999-03-20", gender: "MALE" as const, phone: "9012345678", email: "patient@example.com", createdAt: new Date(), updatedAt: new Date() };

test("patient edit prefills demographics, keeps current inactive facility and uses the shared day-first date field", () => {
  const html = renderToStaticMarkup(<PatientForm organizationId={facility.organizationId} facilities={[facility]} patient={patient} onCancel={() => {}} onSaved={() => {}} />);
  expect(html).toContain('value="Patient Name"');
  expect(html).toContain('value="MRN-2"');
  expect(html).toContain('value="20/03/1999"');
  expect(html).toContain('placeholder="dd/mm/yyyy"');
  expect(html).toContain('value="patient@example.com"');
  expect(html).toContain('inputMode="numeric"');
  expect(html).toContain('pattern="[0-9]*"');
  expect(html).toContain("Save changes");
  expect(html).not.toContain('type="date"');
  expect(html).not.toContain("Add an active facility");
});

test("registration and editing both mark mobile number required", () => {
  const registration = renderToStaticMarkup(<PatientForm organizationId={facility.organizationId} facilities={[facility]} onCancel={() => {}} onSaved={() => {}} />);
  const editing = renderToStaticMarkup(<PatientForm organizationId={facility.organizationId} facilities={[facility]} patient={patient} onCancel={() => {}} onSaved={() => {}} />);
  const registrationPhone = registration.match(/<input[^>]*id="patient-phone"[^>]*>/)?.[0];
  const editingPhone = editing.match(/<input[^>]*id="patient-phone"[^>]*>/)?.[0];
  expect(registrationPhone).toContain('name="phone"');
  expect(registrationPhone).toContain('required=""');
  expect(registration).not.toContain("Mobile number (optional)");
  expect(editing).not.toContain("Mobile number (optional)");
  expect(editingPhone).toContain('required=""');
});

import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

async function withDialog(callback: (ctx: { closeCount: () => number; click: (label: string) => Promise<void> }) => Promise<void>, variant = "patient") {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const values = { Event: dom.window.Event, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  const previous = Object.fromEntries([...Object.keys(values), "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key,value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable:true, writable:true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });

  let closed = 0;
  const root = createRoot(document.getElementById("root")!);
  async function click(label: string) {
    const button = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === label);
    if (!button) throw new Error(`Missing button: ${label}`);
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 0)); });
  }
  try {
    await act(async () => { const onClose = () => { closed++; };
      const user = { userId: "admin", organizationId: facility.organizationId, role: "ORGANIZATION_ADMIN" } as AuthenticatedUser;
      const target = { userId: "other", membershipId: "member", displayName: "Original", email: "user@example.com", role: "DOCTOR", facilities: [] } as unknown as OrganizationUser;
      root.render(variant === "invite" ? <UserInvitationDialog user={user} facilities={[facility]} allFacilities onClose={onClose} onCreated={() => {}} /> :
        variant === "user" ? <UserEditDialog user={user} target={target} facilities={[facility]} allFacilities onClose={onClose} onSaved={() => {}} /> :
        variant.startsWith("facility") ? <FacilityDialog organizationId={facility.organizationId} facility={variant === "facility-edit" ? facility : null} onClose={onClose} onSaved={() => {}} /> :
        <PatientFormDialog organizationId={facility.organizationId} facilities={[{ ...facility, status: "ACTIVE" }]} onClose={onClose} onSaved={() => {}} />); await new Promise(r => setTimeout(r, 0)); });
    await callback({ closeCount: () => closed, click });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
  }
}

test("empty registration closes without confirmation", async () => withDialog(async ({ click, closeCount }) => {
  await click("Cancel");
  expect(closeCount()).toBe(1);
  expect(document.body.textContent).not.toContain("Discard patient changes?");
}));

for (const action of ["Cancel", "Close"]) {
  test(`${action} protects autofilled details and keeps them when continuing`, async () => withDialog(async ({ click, closeCount }) => {
    const email = document.querySelector<HTMLInputElement>("#patient-email")!;
    // Autofill may change the DOM value without a React change event.
    email.value = "patient@example.com";
    await click(action);
    expect(closeCount()).toBe(0);
    expect(document.body.textContent).toContain("Discard patient changes?");
    await click("Keep editing");
    expect(email.value).toBe("patient@example.com");
    expect(closeCount()).toBe(0);
    await click(action);
    await click("Discard changes");
    expect(closeCount()).toBe(1);
  }));
}

test("clearing entered details restores clean dismissal", async () => withDialog(async ({ click, closeCount }) => {
  const name = document.querySelector<HTMLInputElement>("#patient-name")!;
  name.value = "Temporary";
  await click("Cancel");
  await click("Keep editing");
  name.value = "";
  await click("Cancel");
  expect(closeCount()).toBe(1);
}));

for (const action of ["outside click", "Escape"]) {
  test(`${action} asks before discarding registration`, async () => withDialog(async ({ click, closeCount }) => {
    document.querySelector<HTMLInputElement>("#patient-mrn")!.value = "MRN-123";
    await act(async () => {
      if (action === "Escape") {
        document.activeElement!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else {
        const overlay = document.querySelector('[data-slot="dialog-overlay"]')!;
        overlay.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, button: 0 }));
        overlay.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true, button: 0 }));
      }
      await new Promise(r => setTimeout(r, 0));
    });
    expect(closeCount()).toBe(0);
    expect(document.body.textContent).toContain("Discard patient changes?");
    await click("Keep editing");
    expect(document.querySelector<HTMLInputElement>("#patient-mrn")!.value).toBe("MRN-123");
  }));
}

for (const [variant, selector, subject] of [["invite", "#user-invite-email", "user"], ["user", "#edit-user-name", "user"], ["facility-add", "#facility-name", "facility"], ["facility-edit", "#facility-code", "facility"]]) {
  test(`${variant} guards changed details and allows reverting`, async () => withDialog(async ({ click, closeCount }) => {
    const input = document.querySelector<HTMLInputElement>(selector!)!;
    const original = input.value;
    async function setValue(value: string) {
      await act(async () => {
        input.focus();
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
        input.dispatchEvent(new window.KeyboardEvent("keyup", { key: "d", bubbles: true }));
      });
    }
    await setValue("Changed");
    await click("Cancel");
    expect(closeCount()).toBe(0);
    expect(document.body.textContent).toContain(`Discard ${subject} changes?`);
    await click("Keep editing");
    expect(input.value).toBe("Changed");
    await click("Close");
    expect(closeCount()).toBe(0);
    await click("Keep editing");
    await setValue(original);
    await click("Cancel");
    expect(closeCount()).toBe(1);
  }, variant));
}

test("invitation requires an explicit role and starts clean", async () => withDialog(async ({ click, closeCount }) => {
  expect(document.body.textContent).toContain("Select role");
  expect(document.body.textContent).not.toContain("Works with patients and assessments.");
  const submit = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Create invitation")!;
  expect(submit.disabled).toBe(true);
  await click("Cancel");
  expect(closeCount()).toBe(1);
}, "invite"));

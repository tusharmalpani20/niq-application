import { expect, test } from "bun:test";
import { validPushEndpoint } from "./web-push";

test("push endpoint validation blocks local and arbitrary outbound requests", () => {
  expect(validPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
  expect(validPushEndpoint("https://web.push.apple.com/QAbc")).toBe(true);
  expect(validPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
  expect(validPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
  expect(validPushEndpoint("https://127.0.0.1/private")).toBe(false);
  expect(validPushEndpoint("https://fcm.googleapis.com.evil.example/abc")).toBe(false);
  expect(validPushEndpoint("https://fcm.googleapis.com:8443/abc")).toBe(false);
});

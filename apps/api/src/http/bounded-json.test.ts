import { expect, test } from "bun:test";
import { readBoundedJson } from "./bounded-json";
function streaming(body: string, declaredLength?: string) {
  return new Request("https://application.invalid/upload", {
    method: "POST",
    headers: declaredLength ? { "content-length": declaredLength } : {},
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); } }),
    duplex: "half",
  } as RequestInit);
}
test("actual bytes are bounded with absent and understated Content-Length", async () => {
  for (const length of [undefined, "1"])
    await expect(readBoundedJson(streaming('{"payload":"oversized"}', length), 8)).rejects.toMatchObject({ status: 413 });
  expect(await readBoundedJson(streaming('{"ok":true}', "1"), 20)).toEqual({ ok: true });
});
test("a stalled body is cancelled at the request deadline", async () => {
  let cancelled = false;
  const request = new Request("https://application.invalid/upload", {
    method: "POST", body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half",
  } as RequestInit);
  await expect(readBoundedJson(request, 1024, 5)).rejects.toMatchObject({ status: 408 });
  expect(cancelled).toBe(true);
});

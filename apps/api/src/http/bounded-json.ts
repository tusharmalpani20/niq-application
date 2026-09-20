/** Enforce actual streamed bytes even when Content-Length is inaccurate. */
export class BoundedBodyError extends Error {
  constructor(readonly status: 408 | 413, message: string) { super(message); }
}
export async function readBoundedJson(request: Request, maxBytes: number, timeoutMs = 30_000): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new BoundedBodyError(413, "The request is too large.");
  if (!request.body) throw new SyntaxError("Missing JSON body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BoundedBodyError(408, "The upload timed out.")), timeoutMs);
  });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new BoundedBodyError(413, "The request is too large.");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    clearTimeout(timer);
    // A stalled source must not keep the error response waiting on cancellation.
    void reader.cancel().catch(() => {});
  }
}

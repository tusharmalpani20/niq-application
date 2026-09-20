import { constants } from "node:fs";
import { lstat, mkdir, open, unlink, link, opendir } from "node:fs/promises";
import { isAbsolute, join, parse, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { ReportStorageError, scopedKey, scopePrefix, type ReportMediaType, type ReportScope, type ReportSource, type ReportStorage, type StagedReport } from "./report-storage";

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** Private single-host storage. Its root and parents must not be writable by untrusted local users. */
export class LocalReportStorage implements ReportStorage {
  readonly root: string;
  readonly maxFileBytes: number;
  constructor(options: { root: string; maxFileBytes: number }) {
    if (!isAbsolute(options.root) || resolve(options.root) === parse(options.root).root) throw new Error("Report root must be a dedicated absolute directory");
    if (!Number.isSafeInteger(options.maxFileBytes) || options.maxFileBytes < 1) throw new Error("Invalid report byte limit");
    this.root = resolve(options.root);
    this.maxFileBytes = options.maxFileBytes;
  }

  private async directory(path: string, create: boolean): Promise<void> {
    const absolute = resolve(path);
    let current = parse(absolute).root;
    for (const segment of relative(current, absolute).split("/")) {
      current = join(current, segment);
      if (create) await mkdir(current, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new ReportStorageError("UNSAFE_PATH", "Unsafe storage directory");
    }
  }

  private async filePath(scope: ReportScope, key: string, staging = false, create = false): Promise<string> {
    scopedKey(scope, key, staging);
    const path = join(this.root, key);
    await this.directory(join(path, ".."), create);
    return path;
  }

  async stage(scope: ReportScope, fileId: string, source: ReportSource, options: { expectedMediaType?: ReportMediaType; signal?: AbortSignal } = {}): Promise<StagedReport> {
    // Validate file IDs using the same generated-key grammar before receiving bytes.
    scopedKey(scope, `${scopePrefix(scope)}/${fileId}.pdf`);
    const stagingKey = `${scopePrefix(scope)}/.staging/${randomUUID()}.part`;
    const path = await this.filePath(scope, stagingKey, true, true);
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const hash = createHash("sha256");
    let size = 0;
    let header = Buffer.alloc(0);
    try {
      for await (const chunk of cancellable(source, options.signal)) {
        options.signal?.throwIfAborted();
        if (!(chunk instanceof Uint8Array)) throw new ReportStorageError("UNSUPPORTED_FILE", "Expected binary report data");
        size += chunk.byteLength;
        if (size > this.maxFileBytes) throw new ReportStorageError("FILE_TOO_LARGE", "Report exceeds byte limit");
        if (header.length < 8) header = Buffer.concat([header, chunk.subarray(0, 8 - header.length)]);
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.byteLength) {
          const result = await handle.write(chunk, offset, chunk.byteLength - offset);
          if (!result.bytesWritten) throw new Error("Unable to write report");
          offset += result.bytesWritten;
        }
      }
      options.signal?.throwIfAborted();
      const detected = detect(header);
      if (options.expectedMediaType && options.expectedMediaType !== detected.mediaType) throw new ReportStorageError("TYPE_MISMATCH", "Report signature does not match declared type");
      await handle.sync();
      await handle.close();
      return { scope: { ...scope }, fileId, stagingKey, objectKey: `${scopePrefix(scope)}/${fileId}.${detected.extension}`, ...detected, size, sha256: hash.digest("hex") };
    } catch (error) {
      await handle.close().catch(() => {});
      await unlink(path).catch(() => {});
      throw error;
    }
  }

  async promote(report: StagedReport): Promise<void> {
    const source = await this.filePath(report.scope, report.stagingKey, true);
    const destination = await this.filePath(report.scope, report.objectKey);
    const info = await lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) throw new ReportStorageError("UNSAFE_PATH", "Unsafe staged report");
    // Hard-link publication is atomic and fails if a destination already exists; rename could overwrite it.
    await link(source, destination);
    await unlink(source);
  }

  async discard(report: StagedReport): Promise<void> {
    await this.removeKey(report.scope, report.stagingKey, true);
  }

  async open(scope: ReportScope, objectKey: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
    const path = await this.filePath(scope, objectKey);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new ReportStorageError("UNSAFE_PATH", "Invalid report file");
      return { stream: Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>, size: stat.size };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  async remove(scope: ReportScope, objectKey: string): Promise<void> {
    await this.removeKey(scope, objectKey, false);
  }

  private async removeKey(scope: ReportScope, key: string, staging: boolean): Promise<void> {
    scopedKey(scope, key, staging);
    try {
      const path = await this.filePath(scope, key, staging);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new ReportStorageError("UNSAFE_PATH", "Invalid report file");
      await unlink(path);
    } catch (error) { if (!missing(error)) throw error; }
  }

  /** Caller must protect active leases AND ready/submitted DB references; failure is fail-closed. */
  async cleanup(scope: ReportScope, options: { olderThan: Date; limit: number; isProtected: (key: string) => Promise<boolean> }): Promise<string[]> {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1 || !Number.isFinite(options.olderThan.getTime())) throw new Error("Invalid cleanup bounds");
    const removed: string[] = [];
    let checked = 0;
    for (const staging of [true, false]) {
      const prefix = scopePrefix(scope) + (staging ? "/.staging" : "");
      const dir = join(this.root, prefix);
      try { await this.directory(dir, false); } catch (error) { if (missing(error)) continue; throw error; }
      for await (const entry of await opendir(dir)) {
        if (++checked > options.limit) return removed;
        if (!entry.isFile()) continue;
        const key = `${prefix}/${entry.name}`;
        scopedKey(scope, key, staging);
        const stat = await lstat(join(this.root, key));
        if (stat.mtimeMs >= options.olderThan.getTime() || await options.isProtected(key)) continue;
        await this.removeKey(scope, key, staging);
        removed.push(key);
      }
    }
    return removed;
  }
}

function detect(header: Buffer): Pick<StagedReport, "mediaType" | "extension"> {
  if (header.subarray(0, 5).toString("ascii") === "%PDF-") return { mediaType: "application/pdf", extension: "pdf" };
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return { mediaType: "image/jpeg", extension: "jpg" };
  if (header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mediaType: "image/png", extension: "png" };
  throw new ReportStorageError("UNSUPPORTED_FILE", "Only PDF, JPEG and PNG report signatures are supported");
}

/** Abort stalled network reads as well as writes, without waiting for another chunk. */
async function* cancellable(source: ReportSource, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(signal?.reason ?? new Error("Upload cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    signal?.throwIfAborted();
    while (true) {
      const next = await Promise.race([iterator.next(), aborted]);
      if (next.done) return;
      yield next.value;
    }
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
    // A hostile/stalled async iterator may not finish return(); never let it retain the staging file.
    void iterator.return?.().catch(() => {});
  }
}

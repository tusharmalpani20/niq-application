export type ReportScope = { organizationId: string; patientId: string; assessmentId: string };
export type ReportMediaType = "application/pdf" | "image/jpeg" | "image/png";
export type StagedReport = {
  scope: ReportScope;
  fileId: string;
  stagingKey: string;
  objectKey: string;
  mediaType: ReportMediaType;
  extension: "pdf" | "jpg" | "png";
  size: number;
  sha256: string;
};
export type ReportSource = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
export interface ReportStorage {
  stage(scope: ReportScope, fileId: string, source: ReportSource, options?: {
    expectedMediaType?: ReportMediaType; signal?: AbortSignal;
  }): Promise<StagedReport>;
  promote(report: StagedReport): Promise<void>;
  discard(report: StagedReport): Promise<void>;
  open(scope: ReportScope, objectKey: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number }>;
  remove(scope: ReportScope, objectKey: string): Promise<void>;
}

export class ReportStorageError extends Error {
  constructor(public readonly code: "INVALID_KEY" | "UNSAFE_PATH" | "FILE_TOO_LARGE" | "UNSUPPORTED_FILE" | "TYPE_MISMATCH", message: string) {
    super(message);
    this.name = "ReportStorageError";
  }
}

export function scopePrefix(scope: ReportScope): string {
  const values = [scope.organizationId, scope.patientId, scope.assessmentId];
  for (const value of values) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
      throw new ReportStorageError("INVALID_KEY", "Invalid report scope");
    }
  }
  return values.join("/");
}

export function scopedKey(scope: ReportScope, key: string, staging = false): string {
  const prefix = scopePrefix(scope) + (staging ? "/.staging/" : "/");
  const name = key.slice(prefix.length);
  if (!key.startsWith(prefix) || !(staging
    ? /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.part$/
    : /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.(pdf|jpg|png)$/).test(name)) {
    throw new ReportStorageError("INVALID_KEY", "Invalid scoped report key");
  }
  return key;
}

import type { ErrorCode } from "@niq/application-contracts";

export function errorBody(code: ErrorCode, message: string, requestId: string, details?: Record<string, unknown>) {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

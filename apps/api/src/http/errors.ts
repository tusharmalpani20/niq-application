export type ApplicationErrorCode =
  | "AUTH_NOT_CONFIGURED"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "SCORING_UNAVAILABLE"
  | "USER_LIMIT_REACHED"
  | "VALIDATION_ERROR";

export function errorBody(code: ApplicationErrorCode, message: string, requestId: string, details?: Record<string, unknown>) {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

export type ApplicationErrorCode =
  | "ACCOUNT_LOCKED"
  | "AUTH_NOT_CONFIGURED"
  | "AUTHENTICATION_REQUIRED"
  | "CONFLICT"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "INVALID_CREDENTIALS"
  | "INVALID_OR_EXPIRED_TOKEN"
  | "MFA_REQUIRED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "SCORING_UNAVAILABLE"
  | "USER_LIMIT_REACHED"
  | "VALIDATION_ERROR";

export function errorBody(code: ApplicationErrorCode, message: string, requestId: string, details?: Record<string, unknown>) {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

/**
 * The error shape the MillionSend API returns on every non-2xx response, plus
 * the two client-side conditions (a bad request never sent, a transport
 * failure) which carry `statusCode: null`. Mirrors Resend's `ErrorResponse`, so
 * code that switches on `error.name` ports across unchanged.
 */
export interface ErrorResponse {
  /** Stable snake_case code — the discriminant, e.g. "validation_error", "not_found". */
  name: string;
  message: string;
  /** HTTP status; null when the request never reached the API. */
  statusCode: number | null;
  /**
   * Seconds the response's `retry-after` header asks to wait before trying
   * again; null when it sent none (and on client-side failures).
   */
  retryAfter: number | null;
}

/** Every method resolves to this — it never throws for an API error. */
export type Result<T> = { data: T; error: null } | { data: null; error: ErrorResponse };

/** Coerce an arbitrary parsed error body into the canonical shape. */
export function toErrorResponse(
  body: unknown,
  status: number,
  retryAfter: number | null,
): ErrorResponse {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const name = typeof b.name === "string" ? b.name : "application_error";
    const message =
      typeof b.message === "string" ? b.message : `Request failed with status ${status}`;
    const statusCode = typeof b.statusCode === "number" ? b.statusCode : status;
    return { name, message, statusCode, retryAfter };
  }
  return {
    name: "application_error",
    message: `Request failed with status ${status}`,
    statusCode: status,
    retryAfter,
  };
}

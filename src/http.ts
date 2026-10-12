import { type ErrorResponse, type Result, toErrorResponse } from "./error.js";
import type { BatchValidation, Draft, InboxSendOutcome } from "./types.js";

const DEFAULT_BASE_URL = "https://api.millionsend.com";
const DEFAULT_TIMEOUT_MS = 30_000;
/** Time a long-poll answer may take to arrive after the server's own `wait` deadline. */
const LONG_POLL_MARGIN_MS = 10_000;
const SDK_VERSION = "0.9.0";

export interface MillionSendOptions {
  /**
   * Your MillionSend instance URL (no trailing slash needed). Falls back to
   * `MILLIONSEND_BASE_URL`, then MillionSend Cloud (`https://api.millionsend.com`).
   * Self-hosted instances set their own origin here.
   */
  baseUrl?: string;
  /** Inject a fetch implementation (tests, proxies, custom agents). */
  fetch?: typeof fetch;
  /** Extra User-Agent suffix appended after the SDK's own token. */
  userAgent?: string;
  /** Request deadline in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number;
  /**
   * Plain `http://` is only accepted for loopback hosts, since the API key
   * travels as a bearer header. Set to `true` to talk to a non-TLS instance
   * elsewhere (e.g. inside a private network).
   */
  allowInsecureHttp?: boolean;
}

export interface RequestOptions {
  /** POST-only idempotency key (emails.send, batch.send, replies, forwards, drafts.send). */
  idempotencyKey?: string;
}

export interface BatchRequestOptions extends RequestOptions {
  /**
   * `x-batch-validation`: `strict` (the API default) rejects the whole batch
   * when one item is invalid; `permissive` writes the valid subset and lists
   * the failed items in the response's `errors`.
   */
  batchValidation?: BatchValidation;
}

interface DoRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined> | undefined;
  idempotencyKey?: string | undefined;
  /** Extra request headers; undefined values are skipped. */
  headers?: Record<string, string | undefined> | undefined;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True for an `http://` URL whose host is not loopback. Unparseable URLs are left to fetch. */
function isInsecureHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  return !LOOPBACK_HOSTS.has(parsed.hostname) && !parsed.hostname.startsWith("127.");
}

function queryString(query: Record<string, string | number | undefined> | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export class HttpClient {
  readonly #apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(apiKey: string, options: MillionSendOptions = {}) {
    this.#apiKey = apiKey;
    this.baseUrl = (
      options.baseUrl ??
      process.env.MILLIONSEND_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    if (!options.allowInsecureHttp && isInsecureHttpUrl(this.baseUrl)) {
      throw new Error(
        `Refusing to send the API key over plain http to ${this.baseUrl}. Use https, or set allowInsecureHttp: true.`,
      );
    }
    // Bind so a passed-in fetch keeps its own `this`; default to the global.
    const chosen = options.fetch ?? globalThis.fetch;
    if (!chosen) {
      throw new Error(
        "No fetch implementation found. Use Node 18+ or pass `fetch` in the client options.",
      );
    }
    this.fetchImpl = chosen;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("timeoutMs must be a positive finite number.");
    }
    const base = `millionsend-node/${SDK_VERSION}`;
    this.userAgent = options.userAgent ? `${base} ${options.userAgent}` : base;
  }

  async request<T>(req: DoRequest): Promise<Result<T>> {
    return (await this.call<T>(req)).result;
  }

  /**
   * A send a person may have to approve (replies, forwards, drafts.send): an
   * HTTP 202 answer is the draft the API held for approval, any other success
   * the sent email.
   */
  async requestOutcome<T>(req: DoRequest): Promise<Result<InboxSendOutcome<T>>> {
    const { status, result } = await this.call<T | Draft>(req);
    if (result.error) return result;
    const data: InboxSendOutcome<T> =
      status === 202
        ? { kind: "draft", draft: result.data as Draft }
        : { kind: "sent", email: result.data as T };
    return { data, error: null };
  }

  private async call<T>({
    method,
    path,
    body,
    query,
    idempotencyKey,
    headers: extraHeaders,
  }: DoRequest): Promise<{ status: number | null; result: Result<T> }> {
    const url = `${this.baseUrl}${path}${queryString(query)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    for (const [key, value] of Object.entries(extraHeaders ?? {})) {
      if (value !== undefined) headers[key] = value;
    }
    // A `wait` query asks the API to hold its answer up to that many seconds
    // (long-poll), so the deadline has to outlast it.
    const wait = Number(query?.wait ?? 0);
    const timeoutMs =
      wait > 0 ? Math.max(this.timeoutMs, wait * 1000 + LONG_POLL_MARGIN_MS) : this.timeoutMs;
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    // Idempotency is POST-only on the wire; sending it elsewhere is a no-op.
    if (idempotencyKey && method === "POST") headers["Idempotency-Key"] = idempotencyKey;

    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (cause) {
      const error: ErrorResponse = {
        name: "application_error",
        message: cause instanceof Error ? cause.message : String(cause),
        statusCode: null,
      };
      return { status: null, result: { data: null, error } };
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    const status = response.status;
    if (!response.ok) {
      return { status, result: { data: null, error: toErrorResponse(parsed, status) } };
    }
    return { status, result: { data: parsed as T, error: null } };
  }
}

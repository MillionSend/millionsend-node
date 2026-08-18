import { type ErrorResponse, type Result, toErrorResponse } from "./error.js";

const DEFAULT_BASE_URL = "http://localhost:3001";
const DEFAULT_TIMEOUT_MS = 30_000;
const SDK_VERSION = "0.1.0";

export interface MillionSendOptions {
  /**
   * Your MillionSend instance URL (no trailing slash needed). Falls back to
   * `MILLIONSEND_BASE_URL`, then `http://localhost:3001`. Self-hosted, so there
   * is no cloud default — set this to your deployment in production.
   */
  baseUrl?: string;
  /** Inject a fetch implementation (tests, proxies, custom agents). */
  fetch?: typeof fetch;
  /** Extra User-Agent suffix appended after the SDK's own token. */
  userAgent?: string;
  /** Request deadline in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number;
}

export interface RequestOptions {
  /** POST-only idempotency key (emails.send, batch.send). */
  idempotencyKey?: string;
}

interface DoRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined> | undefined;
  idempotencyKey?: string | undefined;
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
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(apiKey: string, options: MillionSendOptions = {}) {
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? process.env.MILLIONSEND_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
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

  async request<T>({ method, path, body, query, idempotencyKey }: DoRequest): Promise<Result<T>> {
    const url = `${this.baseUrl}${path}${queryString(query)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(this.timeoutMs) };
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
      return { data: null, error };
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

    if (!response.ok) {
      return { data: null, error: toErrorResponse(parsed, response.status) };
    }
    return { data: parsed as T, error: null };
  }
}

import type { Result } from "../error.js";
import type { HttpClient, RequestOptions } from "../http.js";
import type {
  CancelEmailResponse,
  CreateEmailResponse,
  Email,
  EmailInsights,
  SendEmailOptions,
} from "../types.js";

function toWire(o: SendEmailOptions) {
  return {
    from: o.from,
    to: o.to,
    subject: o.subject,
    html: o.html,
    text: o.text,
    cc: o.cc,
    bcc: o.bcc,
    reply_to: o.replyTo,
    scheduled_at: o.scheduledAt,
    tags: o.tags,
  };
}

export class Emails {
  constructor(private readonly http: HttpClient) {}

  /** POST /emails — supports an Idempotency-Key. */
  send(
    payload: SendEmailOptions,
    options: RequestOptions = {},
  ): Promise<Result<CreateEmailResponse>> {
    return this.http.request({
      method: "POST",
      path: "/emails",
      body: toWire(payload),
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Alias of {@link send}, mirroring Resend. */
  create(
    payload: SendEmailOptions,
    options: RequestOptions = {},
  ): Promise<Result<CreateEmailResponse>> {
    return this.send(payload, options);
  }

  /** GET /emails/:id */
  get(id: string): Promise<Result<Email>> {
    return this.http.request({ method: "GET", path: `/emails/${encodeURIComponent(id)}` });
  }

  /** GET /emails/:id/insights — not_found until insights exist for the email. */
  getInsights(id: string): Promise<Result<EmailInsights>> {
    return this.http.request({
      method: "GET",
      path: `/emails/${encodeURIComponent(id)}/insights`,
    });
  }

  /** POST /emails/:id/cancel — only scheduled, unsent emails. */
  cancel(id: string): Promise<Result<CancelEmailResponse>> {
    return this.http.request({
      method: "POST",
      path: `/emails/${encodeURIComponent(id)}/cancel`,
    });
  }
}

export class Batch {
  constructor(private readonly http: HttpClient) {}

  /** POST /emails/batch — 1–100 emails in one call; supports an Idempotency-Key. */
  send(
    payload: SendEmailOptions[],
    options: RequestOptions = {},
  ): Promise<Result<{ data: CreateEmailResponse[] }>> {
    return this.http.request({
      method: "POST",
      path: "/emails/batch",
      body: payload.map(toWire),
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Alias of {@link send}, mirroring Resend. */
  create(
    payload: SendEmailOptions[],
    options: RequestOptions = {},
  ): Promise<Result<{ data: CreateEmailResponse[] }>> {
    return this.send(payload, options);
  }
}

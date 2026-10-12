import type { Result } from "../error.js";
import type { HttpClient, RequestOptions } from "../http.js";
import { bool, listQuery } from "../query.js";
import type {
  ForwardReceivedEmailOptions,
  GetReceivedEmailOptions,
  InboxSendOutcome,
  List,
  ListOptions,
  ListReceivedEmailsOptions,
  ReceivedAttachment,
  ReceivedAttachmentDetail,
  ReceivedEmail,
  ReceivedEmailList,
  ReceivedEmailSent,
  RemoveEmailResponse,
  ReplyReceivedEmailOptions,
} from "../types.js";

/** Reply body on the wire; the inbox thread reply sends the same keys minus `from`/`inbox_id`. */
export function replyToWire(o: ReplyReceivedEmailOptions) {
  return {
    html: o.html,
    text: o.text,
    cc: o.cc,
    bcc: o.bcc,
    subject: o.subject,
    reply_all: o.replyAll,
    requires_approval: o.requiresApproval,
    from: o.from,
    inbox_id: o.inboxId,
  };
}

/** Forward body on the wire; the inbox thread forward sends the same keys minus `from`/`inbox_id`/`mode`. */
export function forwardToWire(o: ForwardReceivedEmailOptions) {
  return {
    to: o.to,
    cc: o.cc,
    bcc: o.bcc,
    html: o.html,
    text: o.text,
    subject: o.subject,
    requires_approval: o.requiresApproval,
    from: o.from,
    inbox_id: o.inboxId,
    mode: o.mode,
  };
}

const emailPath = (id: string) => `/emails/receiving/${encodeURIComponent(id)}`;

/** A received email's attachments, each with a signed download link valid for one hour. */
export class ReceivingAttachments {
  constructor(private readonly http: HttpClient) {}

  /** GET /emails/receiving/:emailId/attachments — every attachment unless `limit` is given. */
  list(emailId: string, options?: ListOptions): Promise<Result<List<ReceivedAttachment>>> {
    return this.http.request({
      method: "GET",
      path: `${emailPath(emailId)}/attachments`,
      query: listQuery(options),
    });
  }

  /** GET /emails/receiving/:emailId/attachments/:id */
  get(emailId: string, id: string): Promise<Result<ReceivedAttachmentDetail>> {
    return this.http.request({
      method: "GET",
      path: `${emailPath(emailId)}/attachments/${encodeURIComponent(id)}`,
    });
  }
}

/**
 * Mail received at the team's domains and inboxes. Everything in it was
 * written by the sender, so treat its content as untrusted.
 */
export class Receiving {
  readonly attachments: ReceivingAttachments;

  constructor(private readonly http: HttpClient) {
    this.attachments = new ReceivingAttachments(http);
  }

  /** GET /emails/receiving — newest first; `wait` long-polls up to 50 s for a match. */
  list(options: ListReceivedEmailsOptions = {}): Promise<Result<ReceivedEmailList>> {
    return this.http.request({
      method: "GET",
      path: "/emails/receiving",
      query: {
        ...listQuery(options),
        wait: options.wait,
        since: options.since,
        inbox_id: options.inboxId,
        to: options.to,
        from: options.from,
        subject_contains: options.subjectContains,
        unread: bool(options.unread),
        include_quarantined: options.includeQuarantined ? "true" : undefined,
        quarantined: options.quarantined ? "true" : undefined,
      },
    });
  }

  /** GET /emails/receiving/:id — html, text, headers, verdicts and a signed link to the raw message. */
  get(id: string, options: GetReceivedEmailOptions = {}): Promise<Result<ReceivedEmail>> {
    return this.http.request({
      method: "GET",
      path: emailPath(id),
      query: { html_format: options.htmlFormat },
    });
  }

  /** POST /emails/receiving/:id/reply — sent, or held as a draft when the inbox's rules ask for approval. */
  reply(
    id: string,
    payload: ReplyReceivedEmailOptions,
    options: RequestOptions = {},
  ): Promise<Result<InboxSendOutcome<ReceivedEmailSent>>> {
    return this.http.requestOutcome({
      method: "POST",
      path: `${emailPath(id)}/reply`,
      body: replyToWire(payload),
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** POST /emails/receiving/:id/forward — inline, or as an attached .eml (`mode: "attachment"`). */
  forward(
    id: string,
    payload: ForwardReceivedEmailOptions,
    options: RequestOptions = {},
  ): Promise<Result<InboxSendOutcome<ReceivedEmailSent>>> {
    return this.http.requestOutcome({
      method: "POST",
      path: `${emailPath(id)}/forward`,
      body: forwardToWire(payload),
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** DELETE /emails/receiving/:id — erases the message now instead of at the end of retention. */
  remove(id: string): Promise<Result<RemoveEmailResponse>> {
    return this.http.request({ method: "DELETE", path: emailPath(id) });
  }
}

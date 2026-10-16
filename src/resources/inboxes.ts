import type { Result } from "../error.js";
import type { HttpClient, RequestOptions } from "../http.js";
import { bool, csv, listQuery } from "../query.js";
import type {
  CreateDraftOptions,
  CreateInboxOptions,
  CreateLabelOptions,
  Draft,
  DraftListItem,
  ForwardThreadEmailOptions,
  GetThreadEmailOptions,
  Inbox,
  InboxListItem,
  InboxSafetyOptions,
  InboxSafetyResponse,
  InboxSendOutcome,
  LabelAck,
  LabelList,
  LatestCodeOptions,
  List,
  ListInboxesOptions,
  ListOptions,
  ListThreadEmailsOptions,
  ListThreadsOptions,
  QuarantinedEmail,
  QuarantineRelease,
  ReleaseQuarantinedOptions,
  RemoveDraftResponse,
  RemoveInboxResponse,
  RemoveLabelResponse,
  RemoveThreadResponse,
  ReplyThreadEmailOptions,
  SearchThreadsOptions,
  SentDraft,
  SentEmail,
  ThreadEmail,
  ThreadListItem,
  ThreadSearchResult,
  ThreadSummary,
  UpdateDraftOptions,
  UpdateInboxOptions,
  UpdateLabelOptions,
  UpdateThreadOptions,
  VerificationCode,
} from "../types.js";
import { forwardToWire, replyToWire } from "./receiving.js";

/** `/inboxes/<segments…>`, each segment percent-encoded (the literal ones are plain words). */
function inboxPath(...segments: string[]): string {
  return `/inboxes/${segments.map(encodeURIComponent).join("/")}`;
}

function safetyToWire(s: InboxSafetyOptions) {
  return {
    accept_from: s.acceptFrom,
    allowlist: s.allowlist,
    owner_addresses: s.ownerAddresses,
    screening: s.screening,
    extract_codes: s.extractCodes,
    send_policy: s.sendPolicy,
    require_approval: s.requireApproval,
    private_codes: s.privateCodes,
    send_cap: s.sendCap,
    forward_to: s.forwardTo,
  };
}

function threadsQuery(o: SearchThreadsOptions | undefined) {
  if (!o) return undefined;
  return {
    ...listQuery(o),
    folders: csv(o.folders),
    labels: csv(o.labels),
    read: bool(o.read),
    include_quarantined: o.includeQuarantined ? "true" : undefined,
    query: o.query,
    from: csv(o.from),
    to: csv(o.to),
    cc: csv(o.cc),
    bcc: csv(o.bcc),
    has_attachment: bool(o.hasAttachment),
    start_date: o.startDate,
    end_date: o.endDate,
  };
}

function draftToWire(o: CreateDraftOptions) {
  return {
    to: o.to,
    cc: o.cc,
    bcc: o.bcc,
    subject: o.subject,
    html: o.html,
    text: o.text,
    thread_id: o.threadId,
    reply_to_email_id: o.replyToEmailId,
  };
}

/** Who may write in, what the inbox may send, and what happens before an agent reads (MillionSend extension). */
export class InboxSafetySettings {
  constructor(private readonly http: HttpClient) {}

  /** GET /inboxes/:id/safety */
  get(inboxId: string): Promise<Result<InboxSafetyResponse>> {
    return this.http.request({ method: "GET", path: inboxPath(inboxId, "safety") });
  }

  /** PATCH /inboxes/:id/safety — omitted fields keep their value; inbox-scoped keys get a 403. */
  update(inboxId: string, patch: InboxSafetyOptions): Promise<Result<InboxSafetyResponse>> {
    return this.http.request({
      method: "PATCH",
      path: inboxPath(inboxId, "safety"),
      body: safetyToWire(patch),
    });
  }
}

/** Verification codes and sign-in links pulled from received mail (MillionSend extension). */
export class InboxCodes {
  constructor(private readonly http: HttpClient) {}

  /** GET /inboxes/:id/codes/latest — the newest delivered code or link; `wait` long-polls for one. */
  latest(inboxId: string, options: LatestCodeOptions = {}): Promise<Result<VerificationCode>> {
    return this.http.request({
      method: "GET",
      path: inboxPath(inboxId, "codes", "latest"),
      query: {
        from: options.from,
        wait: options.wait,
        max_age: options.maxAge,
        since: options.since,
      },
    });
  }
}

/** Mail held by the inbox's rules, kept until a person releases it (MillionSend extension). */
export class InboxQuarantine {
  constructor(private readonly http: HttpClient) {}

  /** GET /inboxes/:id/quarantine — newest first; full-access team keys only. */
  list(inboxId: string, options?: ListOptions): Promise<Result<List<QuarantinedEmail>>> {
    return this.http.request({
      method: "GET",
      path: inboxPath(inboxId, "quarantine"),
      query: listQuery(options),
    });
  }

  /** POST /inboxes/:id/quarantine/:emailId/release — delivers it; `trustSender` allowlists the sender. */
  release(
    inboxId: string,
    emailId: string,
    options: ReleaseQuarantinedOptions = {},
  ): Promise<Result<QuarantineRelease>> {
    return this.http.request({
      method: "POST",
      path: inboxPath(inboxId, "quarantine", emailId, "release"),
      body: { trust_sender: options.trustSender },
    });
  }
}

/** Per-inbox labels, up to 100. */
export class InboxLabels {
  constructor(private readonly http: HttpClient) {}

  /** GET /inboxes/:id/labels — unpaginated, oldest first. */
  list(inboxId: string): Promise<Result<LabelList>> {
    return this.http.request({ method: "GET", path: inboxPath(inboxId, "labels") });
  }

  create(inboxId: string, payload: CreateLabelOptions): Promise<Result<LabelAck>> {
    return this.http.request({
      method: "POST",
      path: inboxPath(inboxId, "labels"),
      body: { name: payload.name, color: payload.color },
    });
  }

  update(inboxId: string, labelId: string, payload: UpdateLabelOptions): Promise<Result<LabelAck>> {
    return this.http.request({
      method: "PATCH",
      path: inboxPath(inboxId, "labels", labelId),
      body: { name: payload.name, color: payload.color },
    });
  }

  /** DELETE /inboxes/:id/labels/:labelId — also removes it from every thread. */
  remove(inboxId: string, labelId: string): Promise<Result<RemoveLabelResponse>> {
    return this.http.request({ method: "DELETE", path: inboxPath(inboxId, "labels", labelId) });
  }
}

/** The messages of a thread, both directions. */
export class InboxThreadEmails {
  constructor(private readonly http: HttpClient) {}

  /** GET /inboxes/:id/threads/:threadId/emails — oldest first; `after` pages toward newer. */
  list(
    inboxId: string,
    threadId: string,
    options?: ListThreadEmailsOptions,
  ): Promise<Result<List<ThreadEmail>>> {
    return this.http.request({
      method: "GET",
      path: inboxPath(inboxId, "threads", threadId, "emails"),
      query: {
        ...listQuery(options),
        include_quarantined: options?.includeQuarantined ? "true" : undefined,
      },
    });
  }

  get(
    inboxId: string,
    threadId: string,
    emailId: string,
    options: GetThreadEmailOptions = {},
  ): Promise<Result<ThreadEmail>> {
    return this.http.request({
      method: "GET",
      path: inboxPath(inboxId, "threads", threadId, "emails", emailId),
      query: { include_quarantined: options.includeQuarantined ? "true" : undefined },
    });
  }

  /** POST …/emails/:emailId/reply — sent, or held as a draft when the inbox's rules ask for approval. */
  reply(
    inboxId: string,
    threadId: string,
    emailId: string,
    payload: ReplyThreadEmailOptions,
    options: RequestOptions = {},
  ): Promise<Result<InboxSendOutcome<SentEmail>>> {
    return this.http.requestOutcome({
      method: "POST",
      path: inboxPath(inboxId, "threads", threadId, "emails", emailId, "reply"),
      body: replyToWire(payload),
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** POST …/emails/:emailId/forward — the original quoted below an optional note, with its attachments. */
  forward(
    inboxId: string,
    threadId: string,
    emailId: string,
    payload: ForwardThreadEmailOptions,
    options: RequestOptions = {},
  ): Promise<Result<InboxSendOutcome<SentEmail>>> {
    return this.http.requestOutcome({
      method: "POST",
      path: inboxPath(inboxId, "threads", threadId, "emails", emailId, "forward"),
      body: forwardToWire(payload),
      idempotencyKey: options.idempotencyKey,
    });
  }
}

/** Conversations in an inbox, each in one folder. */
export class InboxThreads {
  readonly emails: InboxThreadEmails;

  constructor(private readonly http: HttpClient) {
    this.emails = new InboxThreadEmails(http);
  }

  /** GET /inboxes/:id/threads — most recently active first. */
  list(inboxId: string, options?: ListThreadsOptions): Promise<Result<List<ThreadListItem>>> {
    return this.http.request({
      method: "GET",
      path: inboxPath(inboxId, "threads"),
      query: threadsQuery(options),
    });
  }

  /** GET /inboxes/:id/threads/search — subject, sender and recipients (bodies are sealed at rest). */
  search(
    inboxId: string,
    options?: SearchThreadsOptions,
  ): Promise<Result<List<ThreadSearchResult>>> {
    return this.http.request({
      method: "GET",
      path: inboxPath(inboxId, "threads", "search"),
      query: threadsQuery(options),
    });
  }

  get(inboxId: string, threadId: string): Promise<Result<ThreadSummary>> {
    return this.http.request({ method: "GET", path: inboxPath(inboxId, "threads", threadId) });
  }

  /** PATCH /inboxes/:id/threads/:threadId — read state, folder, or one more label. */
  update(
    inboxId: string,
    threadId: string,
    payload: UpdateThreadOptions,
  ): Promise<Result<ThreadSummary>> {
    return this.http.request({
      method: "PATCH",
      path: inboxPath(inboxId, "threads", threadId),
      body: { read: payload.read, folder: payload.folder, label_id: payload.labelId },
    });
  }

  /** DELETE /inboxes/:id/threads/:threadId — moves it to trash, purged after 30 days. */
  remove(inboxId: string, threadId: string): Promise<Result<RemoveThreadResponse>> {
    return this.http.request({ method: "DELETE", path: inboxPath(inboxId, "threads", threadId) });
  }
}

/** Drafts, standalone or replies; some wait for a person to approve them. */
export class InboxDrafts {
  constructor(private readonly http: HttpClient) {}

  /** GET /inboxes/:id/drafts — unsent drafts, most recently updated first. */
  list(inboxId: string, options?: ListOptions): Promise<Result<List<DraftListItem>>> {
    return this.http.request({
      method: "GET",
      path: inboxPath(inboxId, "drafts"),
      query: listQuery(options),
    });
  }

  /** POST /inboxes/:id/drafts — a second reply draft for the same email returns the existing one. */
  create(inboxId: string, payload: CreateDraftOptions): Promise<Result<Draft>> {
    return this.http.request({
      method: "POST",
      path: inboxPath(inboxId, "drafts"),
      body: draftToWire(payload),
    });
  }

  get(inboxId: string, draftId: string): Promise<Result<Draft>> {
    return this.http.request({ method: "GET", path: inboxPath(inboxId, "drafts", draftId) });
  }

  /** PATCH /inboxes/:id/drafts/:draftId — `null` clears a field. */
  update(inboxId: string, draftId: string, payload: UpdateDraftOptions): Promise<Result<Draft>> {
    return this.http.request({
      method: "PATCH",
      path: inboxPath(inboxId, "drafts", draftId),
      body: draftToWire(payload),
    });
  }

  remove(inboxId: string, draftId: string): Promise<Result<RemoveDraftResponse>> {
    return this.http.request({ method: "DELETE", path: inboxPath(inboxId, "drafts", draftId) });
  }

  /**
   * POST /inboxes/:id/drafts/:draftId/send — held again as a draft when the
   * rules ask for approval. An agent's key cannot send a draft that waits for
   * approval (403 approval_required); a person or a team key approves it.
   */
  send(
    inboxId: string,
    draftId: string,
    options: RequestOptions = {},
  ): Promise<Result<InboxSendOutcome<SentDraft>>> {
    return this.http.requestOutcome({
      method: "POST",
      path: inboxPath(inboxId, "drafts", draftId, "send"),
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** POST /inboxes/:id/drafts/:draftId/reject — approvers only (MillionSend extension). */
  reject(inboxId: string, draftId: string): Promise<Result<Draft>> {
    return this.http.request({
      method: "POST",
      path: inboxPath(inboxId, "drafts", draftId, "reject"),
    });
  }
}

/** Inboxes: an address that receives mail, read by an agent or by people. */
export class Inboxes {
  readonly safety: InboxSafetySettings;
  readonly codes: InboxCodes;
  readonly quarantine: InboxQuarantine;
  readonly labels: InboxLabels;
  readonly threads: InboxThreads;
  readonly drafts: InboxDrafts;

  constructor(private readonly http: HttpClient) {
    this.safety = new InboxSafetySettings(http);
    this.codes = new InboxCodes(http);
    this.quarantine = new InboxQuarantine(http);
    this.labels = new InboxLabels(http);
    this.threads = new InboxThreads(http);
    this.drafts = new InboxDrafts(http);
  }

  /**
   * POST /inboxes — without `emailAddress` or `domainId`, an address on the
   * instance's shared domain: `username`, or random. Shared and forwarding
   * creates answer 503 `name_review_unavailable` (see `retryAfter`) while the
   * team's subdomain awaits its name review, and so does a chosen `username` or
   * `fromName` there while the review is down; a spent review budget answers 429.
   */
  create(payload: CreateInboxOptions = {}): Promise<Result<Inbox>> {
    return this.http.request({
      method: "POST",
      path: "/inboxes",
      body: {
        email_address: payload.emailAddress,
        domain_id: payload.domainId,
        username: payload.username,
        name: payload.name,
        from_name: payload.fromName,
        forwarding: payload.forwarding,
        kind: payload.kind,
        expires_in: payload.expiresIn,
        safety: payload.safety && safetyToWire(payload.safety),
      },
    });
  }

  /** GET /inboxes — newest first. */
  list(options?: ListInboxesOptions): Promise<Result<List<InboxListItem>>> {
    return this.http.request({
      method: "GET",
      path: "/inboxes",
      query: { ...listQuery(options), kind: options?.kind },
    });
  }

  /** GET /inboxes/:idOrEmail — by id or by address. */
  get(idOrEmail: string): Promise<Result<Inbox>> {
    return this.http.request({ method: "GET", path: inboxPath(idOrEmail) });
  }

  /** PATCH /inboxes/:id — a new `fromName` on the shared domain is reviewed like on `create` (503, 429). */
  update(id: string, payload: UpdateInboxOptions): Promise<Result<Inbox>> {
    return this.http.request({
      method: "PATCH",
      path: inboxPath(id),
      body: { name: payload.name, from_name: payload.fromName, expires_in: payload.expiresIn },
    });
  }

  /** DELETE /inboxes/:id — removes its threads, drafts and labels, and revokes its keys. */
  remove(id: string): Promise<Result<RemoveInboxResponse>> {
    return this.http.request({ method: "DELETE", path: inboxPath(id) });
  }
}

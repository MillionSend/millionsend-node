/**
 * Public request/response types. Inputs are camelCase (mapped to the wire's
 * snake_case by each resource); responses are the wire shape verbatim, so the
 * `object`/`created_at`/`first_name` fields read exactly as the API returns.
 */

export type Recipients = string | string[];

export interface Tag {
  name: string;
  value: string;
}

/** `x-batch-validation` header value for POST /emails/batch and POST /contacts/batch. */
export type BatchValidation = "strict" | "permissive";

/** Permissive-mode batch failure: the request index of the item and why it was rejected. */
export interface BatchError {
  index: number;
  message: string;
}

// ---- shared list envelope ------------------------------------------------
export interface ListOptions {
  limit?: number;
  /** Keyset cursor: return items after this id. Mutually exclusive with `before`. */
  after?: string;
  before?: string;
}

export interface List<T> {
  object: "list";
  data: T[];
  has_more: boolean;
}

// ---- emails --------------------------------------------------------------
export interface Attachment {
  filename: string;
  /** File bytes as a base64 string, or a Buffer (base64-encoded for you). */
  content?: string | Buffer;
  contentType?: string;
  /** Content-ID for inline references (`<img src="cid:...">`). */
  contentId?: string;
  path?: string;
}

export interface SendEmailOptions {
  from: string;
  to: Recipients;
  subject: string;
  html?: string;
  text?: string;
  cc?: Recipients;
  bcc?: Recipients;
  replyTo?: Recipients;
  /** ISO 8601 with offset, or relative ("in 2 hours"); up to 30 days ahead. */
  scheduledAt?: string;
  tags?: Tag[];
  /** Recipients opted out of the topic are skipped and an unsubscribe link is added. */
  topicId?: string | null;
  attachments?: Attachment[];
  /** Extra message headers; transport headers are rejected by the API. */
  headers?: Record<string, string>;
  /** Sent through as-is; MillionSend answers 422 until templates can be sent. */
  template?: { id: string; variables?: Record<string, string | number> };
}

export interface CreateEmailResponse {
  id: string;
}

export interface EmailListItem {
  id: string;
  from: string;
  to: string[];
  cc: string[] | null;
  bcc: string[] | null;
  reply_to: string[] | null;
  subject: string;
  created_at: string;
  scheduled_at: string | null;
  last_event: string;
}

export interface Email extends EmailListItem {
  object: "email";
  html: string | null;
  text: string | null;
  message_id: string;
  /** Best-practice score (0–10, one decimal); null when the email has no insights. */
  score: number | null;
}

export interface UpdateEmailOptions {
  id: string;
  /** New delivery time; only scheduled, unsent emails can be rescheduled. */
  scheduledAt: string;
}

export interface UpdateEmailResponse {
  object: "email";
  id: string;
}

export interface CancelEmailResponse {
  object: "email";
  id: string;
}

export interface RemoveEmailResponse {
  object: "email";
  id: string;
  deleted: true;
}

export interface BatchResponse {
  data: CreateEmailResponse[];
  /** Present in permissive mode: the items that were not accepted. */
  errors?: BatchError[];
}

// ---- insights & deliverability -------------------------------------------
// Open sets: the API grows these across score versions, so each union keeps a
// `(string & {})` escape hatch — known values autocomplete, future ones still
// assign without a type error.
export type ScoreBand = "excellent" | "good" | "needs_attention" | "at_risk" | (string & {});
export type CheckSeverity = "critical" | "major" | "minor" | "info" | (string & {});
export type CheckStatus =
  | "pass"
  | "fail"
  | "passed_by_design"
  | "not_applicable"
  | "unknown"
  | (string & {});
export type GuardrailStatus = "ok" | "warning" | "paused" | (string & {});

export interface InsightsCheck {
  /** Check id from the MillionSend check catalog — an open set. */
  id: string;
  severity: CheckSeverity;
  status: CheckStatus;
  /** Points deducted from the score; 0 unless status is "fail". */
  penalty: number;
  detail?: Record<string, unknown>;
}

export interface EmailInsights {
  object: "email_insights";
  email_id: string;
  /** Best-practice score, 0–10, one decimal. */
  score: number;
  score_version: number;
  band: ScoreBand;
  marketing: boolean;
  html_size_bytes: number | null;
  computed_at: string;
  checks: InsightsCheck[];
}

/** Account score over the trailing window; null scores mean not enough data. */
export interface Deliverability {
  object: "deliverability";
  score: number | null;
  band: ScoreBand | null;
  content_score: number | null;
  outcome_score: number | null;
  complaint_rate: number;
  hard_bounce_rate: number;
  emails_sent: number;
  scored_recipients: number;
  window_days: number;
  insufficient_outcome_data: boolean;
  guardrail_status: GuardrailStatus;
  score_version: number;
}

// ---- contacts ------------------------------------------------------------
export type TopicSubscription = "opt_in" | "opt_out";

export interface ContactTopicUpdate {
  id: string;
  subscription: TopicSubscription;
}

export interface CreateContactOptions {
  email: string;
  firstName?: string;
  lastName?: string;
  unsubscribed?: boolean;
  properties?: Record<string, string | number | boolean | null>;
  /** Segments to add the contact to on creation. */
  segments?: { id: string }[];
  /** Initial per-topic subscription choices. */
  topics?: ContactTopicUpdate[];
}

/** Address a contact by id or email (email wins if both are given). */
export interface ContactAddress {
  id?: string;
  email?: string;
}

export interface UpdateContactOptions extends ContactAddress {
  firstName?: string | null;
  lastName?: string | null;
  unsubscribed?: boolean;
  properties?: Record<string, string | number | boolean | null>;
}

/** Facets a contact read can attach (MillionSend extension). */
export type ContactInclude = "properties" | "topics";

export interface ListContactsOptions extends ListOptions {
  /** List only the contacts matching this segment (GET /segments/:id/contacts). */
  segmentId?: string;
  /** Attach `properties` and/or `topics` to every item (`?include=properties,topics`). */
  include?: ContactInclude[];
}

export interface BatchGetContactsOptions {
  /** Attach `properties` and/or `topics` to every contact returned. */
  include?: ContactInclude[];
}

export interface BatchGetContactsResponse {
  object: "list";
  /** The contacts found, in request order. */
  data: BatchGetContact[];
  /** Request entries that matched no contact, by their position in the request. */
  missing: { index: number; id?: string; email?: string }[];
}

export interface ContactId {
  object: "contact";
  id: string;
}

/** A custom property as returned by GET /contacts/:id — typed by the property definition. */
export type ContactPropertyValue =
  | { type: "string"; value: string }
  | { type: "number"; value: number };

export interface Contact {
  object: "contact";
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  unsubscribed: boolean;
  properties: Record<string, ContactPropertyValue>;
}

/** One contact as `batch.get` returns it: the list item plus the facets `include` asked for. */
export type BatchGetContact = ContactListItem & { object: "contact" };

export interface ContactListItem {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  unsubscribed: boolean;
  /** Only with `include: ["properties"]`. */
  properties?: Record<string, ContactPropertyValue>;
  /** Only with `include: ["topics"]`. */
  topics?: ContactTopic[];
}

export interface RemoveContactResponse {
  object: "contact";
  contact: string;
  deleted: true;
}

export interface RemoveContactOptions {
  /**
   * Also scrub the address from email history, event payloads and API logs
   * (`erase=true`, a GDPR/LGPD erasure). Without it the contact's emails stay
   * in the send log.
   */
  erase?: boolean;
}

export type BatchRemoveContactsOptions = RemoveContactOptions &
  ({ ids: string[]; emails?: never } | { emails: string[]; ids?: never });

/** The contact's hosted preference page (POST /contacts/:id/preferences-link). */
export interface ContactPreferencesLink {
  object: "preferences_link";
  contact: string;
  /** Signed, contact-scoped and non-expiring: hand it only to the contact. */
  url: string;
}

export interface UpdateContactTopicsOptions extends ContactAddress {
  topics: ContactTopicUpdate[];
}

export interface UpdateContactTopicsResponse {
  id: string;
}

export type ListContactTopicsOptions = ContactAddress;

/** One of the team's topics as seen by a contact (GET /contacts/:id/topics). */
export interface ContactTopic {
  id: string;
  name: string;
  description: string | null;
  /** Effective choice: the contact's explicit one, else the topic's default. */
  subscription: TopicSubscription;
  /** False when `subscription` is only the topic's default. */
  explicit: boolean;
  /** The hosted preference page lists public topics only. */
  visibility: TopicVisibility;
}

/** What POST /contacts/batch does with an email that already belongs to a contact. */
export type ContactOnConflict = "error" | "skip" | "upsert";

export interface CreateContactsBatchOptions {
  /** `error` (default) fails the item, `skip` reports the existing id, `upsert` merges into it. */
  onConflict?: ContactOnConflict;
  batchValidation?: BatchValidation;
}

export interface BatchContactResult {
  object: "contact";
  /** Position of the item in the request array. */
  index: number;
  /** The contact's id (the existing one for skipped/updated). */
  id: string;
  status: "created" | "updated" | "skipped";
}

export interface BatchContactsResponse {
  data: BatchContactResult[];
  counts: { created: number; updated: number; skipped: number; failed: number };
  /** Present in permissive mode: the items that were not written. */
  errors?: BatchError[];
}

/** Address a contact by id, email or Resend's `contactId` (email wins). */
export interface ContactSegmentOptions extends ContactAddress {
  contactId?: string;
  segmentId: string;
}

export interface AddContactSegmentResponse {
  id: string;
}

export interface RemoveContactSegmentResponse {
  id: string;
  audienceId: string;
  deleted: true;
}

// ---- contact properties --------------------------------------------------
export type ContactPropertyType = "string" | "number";

export interface CreateContactPropertyOptions {
  key: string;
  type: ContactPropertyType;
  /** Value used when a contact has no value for the key; null means none. */
  fallbackValue?: string | number | null;
}

export interface UpdateContactPropertyOptions {
  id: string;
  fallbackValue?: string | number | null;
}

export interface ContactPropertyListItem {
  id: string;
  created_at: string;
  key: string;
  type: ContactPropertyType;
  fallback_value: string | number | null;
}

export interface ContactProperty extends ContactPropertyListItem {
  object: "contact_property";
}

export interface ContactPropertyId {
  object: "contact_property";
  id: string;
}

export interface RemoveContactPropertyResponse {
  object: "contact_property";
  id: string;
  deleted: true;
}

// ---- topics --------------------------------------------------------------
export type TopicVisibility = "private" | "public";

export interface CreateTopicOptions {
  name: string;
  description?: string;
  defaultSubscription: TopicSubscription;
  visibility?: TopicVisibility;
}

export interface UpdateTopicOptions {
  name?: string;
  description?: string;
  visibility?: TopicVisibility;
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  default_subscription: TopicSubscription;
  visibility: TopicVisibility;
  created_at: string;
}

export interface TopicId {
  id: string;
}

export interface RemoveTopicResponse {
  id: string;
  object: "topic";
  deleted: true;
}

// ---- broadcasts ----------------------------------------------------------
export interface CreateBroadcastOptions {
  name?: string;
  segmentId?: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: Recipients;
  /** Inbox preview (preheader) text. */
  previewText?: string;
  topicId?: string | null;
  /** true sends (or schedules) immediately instead of saving a draft. */
  send?: boolean;
  /** Deliver later (requires `send: true`); ISO 8601 with offset or relative. */
  scheduledAt?: string;
}

export interface UpdateBroadcastOptions {
  name?: string;
  segmentId?: string;
  from?: string;
  subject?: string;
  html?: string;
  text?: string;
  replyTo?: Recipients;
  previewText?: string;
  /** null clears the topic. */
  topicId?: string | null;
}

export interface SendBroadcastOptions {
  /** ISO 8601 with offset; omit to send now. */
  scheduledAt?: string;
}

export interface BroadcastId {
  id: string;
}

export interface BroadcastListItem {
  id: string;
  name: string | null;
  segment_id: string | null;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
}

export interface Broadcast extends BroadcastListItem {
  object: "broadcast";
  from: string;
  subject: string;
  reply_to: string[] | null;
  preview_text: string | null;
  topic_id: string | null;
  html: string | null;
  text: string | null;
}

export interface CancelBroadcastResponse {
  object: "broadcast";
  id: string;
}

export interface RemoveBroadcastResponse {
  object: "broadcast";
  id: string;
  deleted: true;
}

// ---- segments (MillionSend dynamic segments) -----------------------------
export type SegmentMatch = "all" | "any";

export interface SegmentCondition {
  field: string;
  op: string;
  value?: string | null;
}

export interface SegmentFilter {
  match: SegmentMatch;
  conditions: SegmentCondition[];
}

export interface CreateSegmentOptions {
  name: string;
  filter: SegmentFilter;
}

export interface UpdateSegmentOptions {
  name?: string;
  filter?: SegmentFilter;
}

export interface Segment {
  object: "segment";
  id: string;
  name: string;
  filter: SegmentFilter;
  created_at: string;
  /** Present on `get` only — the live count of matching contacts. */
  contact_count?: number;
}

export interface RemoveSegmentResponse {
  object: "segment";
  id: string;
  deleted: true;
}

// ---- suppressions --------------------------------------------------------
export type SuppressionOrigin = "bounce" | "complaint" | "manual" | "unsubscribe";

export interface AddSuppressionOptions {
  email: string;
  /** Origin recorded on the new row (default manual); an already suppressed address keeps its origin. */
  origin?: SuppressionOrigin;
}

export interface ListSuppressionsOptions extends ListOptions {
  origin?: SuppressionOrigin;
}

export interface SuppressionId {
  object: "suppression";
  id: string;
}

export interface SuppressionListItem {
  id: string;
  email: string;
  origin: SuppressionOrigin;
  /** Email id whose bounce/complaint created the entry. */
  source_id: string | null;
  created_at: string;
}

export interface Suppression extends SuppressionListItem {
  object: "suppression";
}

export interface RemoveSuppressionResponse {
  object: "suppression";
  id: string;
  deleted: true;
}

export interface BatchAddSuppressionsOptions {
  /** Up to 1000 addresses; duplicates collapse. */
  emails: string[];
  origin?: SuppressionOrigin;
}

export type BatchRemoveSuppressionsOptions =
  | { emails: string[]; ids?: never }
  | { ids: string[]; emails?: never };

// ---- domains -------------------------------------------------------------
export type DomainRegion = "us-east-1" | "eu-west-1" | "sa-east-1" | "ap-northeast-1";

export interface DomainCapabilities {
  sending: string;
  receiving: string;
}

export interface CreateDomainOptions {
  name: string;
  /** Each deployment serves one region and rejects any other; omit to use it. */
  region?: DomainRegion;
  /** Return-path subdomain label (default "send"). */
  customReturnPath?: string;
  openTracking?: boolean;
  clickTracking?: boolean;
  /** DNS label of the branded tracking host, e.g. "links" for links.<domain>. */
  trackingSubdomain?: string;
}

export interface UpdateDomainOptions {
  id: string;
  openTracking?: boolean;
  clickTracking?: boolean;
  /** Empty string or null clears it. */
  trackingSubdomain?: string | null;
  /** Accepted for Resend payload compatibility; MillionSend ignores them. */
  tls?: "enforced" | "opportunistic";
  capabilities?: Partial<DomainCapabilities>;
  /**
   * Accept mail for addresses that have no inbox (they land in received mail).
   * Off, those addresses are refused. Turning it on needs a paid plan on Cloud.
   */
  receivingCatchAll?: boolean;
}

export interface DomainRecord {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority?: number;
}

export interface DomainListItem {
  id: string;
  name: string;
  status: string;
  created_at: string;
  region: string;
  open_tracking: boolean;
  click_tracking: boolean;
  tracking_subdomain: string | null;
  capabilities: DomainCapabilities;
  /** Whether mail to addresses without an inbox is accepted; absent on instances before inboxes. */
  receiving_catch_all?: boolean;
}

export interface CreateDomainResponse extends DomainListItem {
  records: DomainRecord[];
}

export interface Domain extends CreateDomainResponse {
  object: "domain";
}

export interface RemoveDomainResponse {
  object: "domain";
  id: string;
  deleted: true;
}

// ---- webhooks ------------------------------------------------------------
export type WebhookEvent =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked"
  | "deliverability.warning"
  | "deliverability.paused"
  | "quota.warning"
  | "quota.reached"
  | "quota.paused"
  | "contact.created"
  | "contact.updated"
  | "contact.deleted"
  | "contact.unsubscribed"
  | "contact.resubscribed"
  | "contact.topic_opt_in"
  | "contact.topic_opt_out"
  | "suppression.added"
  | "suppression.removed"
  | "email.received"
  // Inbox events reach only endpoints that list them; "all events" never includes them.
  | "inbox.created"
  | "inbox.updated"
  | "inbox.deleted"
  | "inbox.expired"
  | "inbox.thread.created"
  | "inbox.thread.folder.updated"
  | "inbox.thread.labels.updated"
  | "inbox.email.received"
  | "inbox.email.sent"
  | "inbox.email.quarantined"
  | "inbox.draft.created"
  | "inbox.draft.updated"
  | "inbox.draft.sent"
  | "inbox.draft.deleted"
  | (string & {});

export type WebhookStatus = "enabled" | "disabled";

export interface CreateWebhookOptions {
  endpoint: string;
  events: WebhookEvent[];
  /** Carry over an existing `whsec_…` secret so the receiver keeps verifying unchanged; omit to mint one. */
  signingSecret?: string;
  /** Deliver inbox events and `email.received` only for these inboxes; null or omitted = every inbox. */
  inboxIds?: string[] | null;
}

export interface UpdateWebhookOptions {
  endpoint?: string;
  events?: WebhookEvent[];
  status?: WebhookStatus;
  /** null delivers for every inbox again. */
  inboxIds?: string[] | null;
}

export interface CreateWebhookResponse {
  object: "webhook";
  id: string;
  signing_secret: string;
}

export interface WebhookListItem {
  id: string;
  endpoint: string;
  created_at: string;
  status: WebhookStatus;
  events: string[] | null;
  /** The inboxes this endpoint is limited to; null = every inbox. Absent on instances before inboxes. */
  inbox_ids?: string[] | null;
}

export interface Webhook extends WebhookListItem {
  object: "webhook";
  signing_secret: string;
  /** While set, deliveries are also signed with the secret this one replaced. */
  previous_secret_expires_at: string | null;
}

export interface RotateWebhookSecretOptions {
  /** New `whsec_…` secret to sign with; omit to mint one. */
  signingSecret?: string;
  /** Hours the previous secret keeps signing alongside the new one (0–72; the API defaults to 24). */
  overlapHours?: number;
}

export interface RotateWebhookSecretResponse {
  object: "webhook";
  id: string;
  signing_secret: string;
  previous_secret_expires_at: string | null;
}

export interface WebhookId {
  object: "webhook";
  id: string;
}

export interface RemoveWebhookResponse {
  object: "webhook";
  id: string;
  deleted: true;
}

// ---- api keys ------------------------------------------------------------
export type ApiKeyPermission = "full_access" | "sending_access";

export interface CreateApiKeyOptions {
  name: string;
  /** Defaults to full_access. */
  permission?: ApiKeyPermission;
  /** Restrict a sending_access key to one domain. */
  domainId?: string | null;
  /** Resend's spelling of `domainId`; either works. */
  domain_id?: string | null;
  /**
   * Restrict a full_access key to one inbox: it reads that inbox and sends
   * only from its address. Up to 5 per inbox; cannot be combined with a domain.
   */
  inboxId?: string | null;
}

export interface CreateApiKeyResponse {
  id: string;
  /** The secret, shown once. */
  token: string;
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  /** Set on an inbox-scoped key; absent on instances before inboxes. */
  inbox_id?: string | null;
}

export interface RemoveApiKeyResponse {
  object: "api_key";
  id: string;
  deleted: true;
}

// ---- templates -----------------------------------------------------------
export interface CreateTemplateOptions {
  name: string;
  html: string;
  /** "" or null clears the subject. */
  subject?: string | null;
  /** "" or null clears the text part. */
  text?: string | null;
  /** Case-sensitive handle, unique per team; `get(alias)` resolves it. */
  alias?: string | null;
  /** Sent through as-is; MillionSend answers 422 for any value. */
  from?: string | null;
  /** Sent through as-is; MillionSend answers 422 for any value. */
  replyTo?: Recipients | null;
  /** Sent through as-is; MillionSend answers 422 for a non-empty list. */
  variables?: unknown[];
}

export interface UpdateTemplateOptions {
  name?: string;
  html?: string;
  subject?: string | null;
  text?: string | null;
  /** null clears the alias. */
  alias?: string | null;
  from?: string | null;
  replyTo?: Recipients | null;
  variables?: unknown[];
}

export interface TemplateId {
  object: "template";
  id: string;
}

export interface TemplateListItem {
  id: string;
  name: string;
  alias: string | null;
  /** Always "published": every save is live. */
  status: "published";
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface Template extends TemplateListItem {
  object: "template";
  current_version_id: string;
  from: string | null;
  subject: string | null;
  reply_to: string | string[] | null;
  html: string;
  text: string | null;
  variables: unknown[];
  has_unpublished_versions: false;
}

export interface RemoveTemplateResponse {
  object: "template";
  id: string;
  deleted: true;
}

// ---- usage (MillionSend extension) ---------------------------------------
export interface Usage {
  object: "usage";
  /** True on MillionSend Cloud, where plan limits apply. */
  cloud: boolean;
  /** Effective plan; null when self-hosted. */
  plan: "free" | "pro" | "scale" | null;
  /** null = unlimited or self-hosted. `inboxes` is absent on instances before inboxes. */
  limits: { emails_per_day: number | null; domains: number | null; inboxes?: number | null };
  today: { emails_sent: number; resets_at: string };
  team: { id: string; name: string };
  /** Dashboard origin, for building links; null when unset. */
  app_url: string | null;
}

// ---- received mail -------------------------------------------------------
// MillionSend's own enums are open sets (the API may grow them); Resend's
// (folder, direction, draft type) never gain values, so they stay closed.
export type SenderTrust =
  | "owner"
  | "allowlisted"
  | "known_thread"
  | "external"
  | "unauthenticated"
  | "failed"
  | (string & {});
export type ScreeningVerdict =
  | "pending"
  | "clean"
  | "suspicious"
  | "quarantined"
  | "released"
  | (string & {});
export type QuarantineReason =
  | "failed_auth"
  | "unauthenticated_sender"
  | "not_allowlisted"
  | "injection"
  | "phishing"
  | "virus"
  | "unscreened"
  | "screening_cap"
  | (string & {});
export type SpamVerdict = "pass" | "gray" | "fail" | (string & {});
export type VirusVerdict = "pass" | "fail" | "processing_failed" | (string & {});
export type ExtractedKind = "code" | "link" | (string & {});

/** The verdict and the sender's trust tier, as lists carry them. */
export interface ScreeningSummary {
  verdict: ScreeningVerdict;
  sender_trust: SenderTrust;
}

/** How an inbox screened one message. Scores are 0–100, null when it was not judged. */
export interface Screening extends ScreeningSummary {
  /** Set while quarantined or after a release. */
  quarantine_reason: QuarantineReason | null;
  reasons: string[];
  injection_score: number | null;
  phishing_score: number | null;
  hidden_text_removed: boolean;
}

export interface ReceivedEmailAttachment {
  id: string;
  filename: string | null;
  content_type: string;
  content_id: string | null;
  content_disposition: string | null;
  size: number;
}

/** One inbox a received message landed in (owner views). */
export interface ReceivedEmailInbox {
  inbox_id: string;
  thread_id: string;
  verdict: ScreeningVerdict;
}

/** Fields after `attachments` are MillionSend extensions, absent on instances before inboxes. */
export interface ReceivedEmailListItem {
  id: string;
  to: string[];
  /** Bare address; the display name is in the detail's `headers.from`. */
  from: string;
  created_at: string;
  subject: string;
  bcc: string[];
  cc: string[];
  reply_to: string[];
  /** The team's envelope recipients: the addresses the message was delivered to. */
  received_for: string[];
  message_id: string;
  attachments: ReceivedEmailAttachment[];
  inbox_id?: string | null;
  thread_id?: string | null;
  /** Owner views only. */
  inboxes?: ReceivedEmailInbox[];
  screening?: ScreeningSummary | null;
  spam_verdict?: SpamVerdict | null;
  virus_verdict?: VirusVerdict | null;
  extracted?: { kinds: ExtractedKind[] };
  /** Present with an inbox context. */
  read?: boolean;
}

/** A membership held for screening or quarantine; the long-poll reports ids and why only. */
export interface HeldEmail {
  id: string;
  /** Null for a catch-all copy held for a virus. */
  inbox_id: string | null;
  reason: "pending" | "quarantined";
  /** Why it was quarantined; null while it is still being screened. */
  quarantine_reason: QuarantineReason | null;
  created_at: string;
}

export interface ReceivedEmailList extends List<ReceivedEmailListItem> {
  /** Long-poll (`wait`) only: held messages that matched since the cursor. */
  held?: HeldEmail[];
}

export interface ListReceivedEmailsOptions extends ListOptions {
  /** Long-poll: hold the request up to this many seconds (0–50) until a matching email arrives. */
  wait?: number;
  /** ISO 8601: only mail received after this instant. */
  since?: string;
  inboxId?: string;
  /** An address the message was delivered to (`received_for`). */
  to?: string;
  /** A sender address, or a domain covering its subdomains. */
  from?: string;
  subjectContains?: string;
  /** Needs `inboxId`. */
  unread?: boolean;
  /** Also list held mail (full-access team keys only). */
  includeQuarantined?: boolean;
  /** List only held mail (full-access team keys only). */
  quarantined?: boolean;
}

export interface GetReceivedEmailOptions {
  /** `data_uri` (default) inlines `cid:` images; `cid` leaves the references. */
  htmlFormat?: "data_uri" | "cid";
}

/** A verification code or sign-in link found in the message (`extract_codes` inboxes). */
export interface ReceivedExtracted {
  kinds: ExtractedKind[];
  code?: string | null;
  link?: string | null;
  link_domain_matches_sender?: boolean | null;
  ambiguous?: boolean;
}

export interface ReceivedEmail extends ReceivedEmailListItem {
  object: "email";
  html: string | null;
  html_format: "data_uri" | "cid";
  /** Invisible characters removed; `html` and `raw` stay byte-faithful. */
  text: string | null;
  headers: Record<string, string> | null;
  authentication: { spf: string; dkim: string; dmarc: string };
  /** Signed link to the original message, valid for one hour; null once purged or when it carries malware. */
  raw: { download_url: string; expires_at: string } | null;
  screening?: Screening | null;
  spam_score?: number | null;
  virus_signature?: string | null;
  /** The new part of the message as plain text: hidden text, quotes and the signature removed. */
  extracted_text?: string | null;
  extracted?: ReceivedExtracted;
}

export interface ReceivedAttachment {
  id: string;
  filename?: string;
  size: number;
  content_type: string;
  content_disposition: "inline" | "attachment";
  content_id?: string;
  /** Signed link to the bytes, valid for one hour; it needs no API key. */
  download_url: string;
  expires_at: string;
}

export interface ReceivedAttachmentDetail extends ReceivedAttachment {
  object: "attachment";
}

export interface ReplyThreadEmailOptions {
  html?: string;
  text?: string;
  cc?: Recipients;
  bcc?: Recipients;
  /** Defaults to `Re: ` plus the thread subject. */
  subject?: string;
  /** Also copy the message's other recipients. */
  replyAll?: boolean;
  /** Hold it as a draft for a person to approve. */
  requiresApproval?: boolean;
}

export interface ReplyReceivedEmailOptions extends ReplyThreadEmailOptions {
  /** An address on a verified team domain; defaults to the inbox the message landed in. */
  from?: string;
  /** Reply as this inbox when the message landed in several. */
  inboxId?: string;
}

export interface ForwardThreadEmailOptions {
  to: Recipients;
  cc?: Recipients;
  bcc?: Recipients;
  /** A note above the forwarded message. */
  html?: string;
  text?: string;
  /** Defaults to `Fwd: ` plus the thread subject. */
  subject?: string;
  requiresApproval?: boolean;
}

export interface ForwardReceivedEmailOptions extends ForwardThreadEmailOptions {
  from?: string;
  inboxId?: string;
  /** `inline` (default) quotes the message; `attachment` attaches it as `forwarded_message.eml`. */
  mode?: "inline" | "attachment";
}

/** What `emails.receiving.reply` / `forward` sent. */
export interface ReceivedEmailSent {
  object: "email";
  id: string;
  thread_id: string | null;
  inbox_id: string | null;
}

/**
 * The outcome of a send from an inbox: sent now, or held as a draft that waits
 * for a person (HTTP 202) because the inbox's rules or `requiresApproval` asked.
 */
export type InboxSendOutcome<T> = { kind: "sent"; email: T } | { kind: "draft"; draft: Draft };

// ---- inboxes -------------------------------------------------------------
export type InboxKind = "agent" | "human" | (string & {});

/** Fields after `created_at` are MillionSend extensions. */
export interface Inbox {
  object: "inbox";
  id: string;
  name: string;
  email_address: string;
  /** For an address on the shared domain, the id of the team's shared subdomain (not listed by /domains). */
  domain_id: string;
  receiving_address: string | null;
  from_name: string | null;
  /** Threads with an unread message. */
  unread: number;
  /** Unsent drafts. */
  drafts: number;
  last_received: string | null;
  created_at: string;
  kind: InboxKind;
  /** The address is on the instance's shared domain. */
  shared: boolean;
  expires_at: string | null;
  /** Messages in quarantine, not released. */
  quarantined: number;
  pending_approval: number;
}

export interface InboxListItem {
  id: string;
  name: string | null;
  email_address: string;
  from_name: string | null;
  unread: number;
  last_received: string | null;
  kind: InboxKind;
  shared: boolean;
  expires_at: string | null;
}

/** An inbox's safety rules. */
export interface InboxSafety {
  accept_from: "anyone" | "verified" | "allowlist" | (string & {});
  /** `local@domain` (exact) or `*@domain` (the domain and its subdomains). */
  allowlist: string[];
  /** Owners besides the team members' login addresses. */
  owner_addresses: string[];
  /** Score external and unauthenticated mail for prompt injection (agent inboxes). */
  screening: boolean;
  extract_codes: boolean;
  send_policy: "reply_only" | "allowlist" | "open" | (string & {});
  require_approval: boolean;
  private_codes: boolean;
  /** Recipients per UTC day sent without approval; null = no inbox cap. */
  send_cap: number | null;
  forward_to: string[];
}

export interface InboxSafetyResponse extends InboxSafety {
  object: "inbox_safety";
  inbox_id: string;
}

/** A change to an inbox's safety rules; omitted fields keep their value. */
export interface InboxSafetyOptions {
  acceptFrom?: InboxSafety["accept_from"];
  allowlist?: string[];
  ownerAddresses?: string[];
  screening?: boolean;
  extractCodes?: boolean;
  sendPolicy?: InboxSafety["send_policy"];
  requireApproval?: boolean;
  privateCodes?: boolean;
  sendCap?: number | null;
  /** Team members' login addresses or `ownerAddresses` only. */
  forwardTo?: string[];
}

export interface CreateInboxOptions {
  /** Omit for a random address on the instance's shared domain. */
  emailAddress?: string;
  name?: string;
  /** Display name for sending; a plain name, not `Name <email>`. */
  fromName?: string;
  /** Receive at a generated `receiving_address` on the shared domain instead of the domain's MX. */
  forwarding?: boolean;
  /** Defaults to "agent". */
  kind?: "agent" | "human";
  /** `<n>h` or `<n>d` (e.g. "24h", "7d"); null = never (custom domains only). */
  expiresIn?: string | null;
  /** Starting safety rules on top of the kind's defaults. */
  safety?: InboxSafetyOptions;
}

export interface UpdateInboxOptions {
  name?: string;
  /** "" removes it. */
  fromName?: string;
  expiresIn?: string | null;
}

export interface ListInboxesOptions extends ListOptions {
  kind?: InboxKind;
}

export interface RemoveInboxResponse {
  object: "inbox";
  id: string;
  deleted: true;
}

export interface LatestCodeOptions {
  /** A sender address, or a domain covering its subdomains. */
  from?: string;
  /** Long-poll up to this many seconds (0–50) for a code to arrive. */
  wait?: number;
  /** Oldest message to consider, in seconds (60–86400; the API defaults to 600). */
  maxAge?: number;
}

export interface VerificationCode {
  object: "verification_code";
  /** `timeout` only when `wait` ran out with nothing new. */
  status: "found" | "none" | "ambiguous" | "timeout" | (string & {});
  kind: "otp" | "link" | null;
  code: string | null;
  url: string | null;
  link_domain_matches_sender: boolean | null;
  email_id: string | null;
  from: string | null;
  received_at: string | null;
  sender_trust: SenderTrust | null;
}

export interface QuarantinedEmail {
  id: string;
  /** Null for a catch-all copy held for a virus, which belongs to no inbox. */
  thread_id: string | null;
  from: string;
  subject: string | null;
  received_at: string;
  quarantine_reason: QuarantineReason;
  sender_trust: SenderTrust;
  injection_score: number | null;
  phishing_score: number | null;
  virus_signature: string | null;
}

export interface ReleaseQuarantinedOptions {
  /** Also add the sender to the inbox's allowlist. */
  trustSender?: boolean;
}

export interface QuarantineRelease {
  object: "inbox_release";
  inbox_id: string;
  email_id: string;
  released_at: string;
  /** The address added to the allowlist, or null. */
  trusted_sender: string | null;
}

// ---- inbox labels --------------------------------------------------------
export interface ThreadLabel {
  id: string;
  name: string;
  /** `#RRGGBB`, uppercase. */
  color: string;
}

export interface Label extends ThreadLabel {
  created_at: string;
}

/** Labels are not paginated: every label of the inbox, oldest first. */
export interface LabelList {
  object: "list";
  data: Label[];
}

/** What creating or updating a label answers: the whole label. */
export interface LabelAck extends Label {
  object: "inbox_label";
}

export interface CreateLabelOptions {
  name: string;
  /** `#RRGGBB`; random when omitted. */
  color?: string;
}

export interface UpdateLabelOptions {
  name?: string;
  color?: string;
}

export interface RemoveLabelResponse {
  object: "inbox_label";
  id: string;
  deleted: true;
}

// ---- inbox threads -------------------------------------------------------
export type ThreadFolder = "inbox" | "archive" | "spam" | "sent" | "trash";
/** `sent` is assigned by the API and cannot be set. */
export type MoveThreadFolder = "inbox" | "archive" | "spam" | "trash";

export interface ThreadSummary {
  object: "inbox_thread";
  id: string;
  subject: string | null;
  folder: ThreadFolder;
  labels: ThreadLabel[];
  read: boolean;
  /** MillionSend extension: held messages (owner views; 0 for agent views). */
  quarantined: number;
}

export interface ThreadListItem {
  id: string;
  subject: string | null;
  /** The latest inbound sender (`Name <address>`), or the inbox address for outbound-only threads. */
  from: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  labels: ThreadLabel[];
  message_count: number;
  has_attachment: boolean;
  has_draft: boolean;
  read: boolean;
  /** Last activity; the sort key. */
  received_at: string;
  folder: ThreadFolder;
}

export interface ThreadSearchResult extends ThreadListItem {
  matched_email_id: string | null;
  /** Only the keys that matched, each a list of fragments with `**match**` markers. */
  highlights: Partial<Record<"subject" | "from" | "to" | "cc" | "bcc" | (string & {}), string[]>>;
}

export interface GetThreadEmailOptions {
  /** Owner views: also read a held message (full-access team keys only). */
  includeQuarantined?: boolean;
}

export interface ListThreadEmailsOptions extends ListOptions, GetThreadEmailOptions {}

export interface ListThreadsOptions extends ListOptions {
  /** Defaults to `inbox` (`inbox`, `archive`, `sent` with `labels`). */
  folders?: ThreadFolder[];
  /** Label ids, any-match (up to 50). */
  labels?: string[];
  read?: boolean;
  /** Owner views: also list threads whose messages are all held. */
  includeQuarantined?: boolean;
}

export interface SearchThreadsOptions extends ListThreadsOptions {
  /** Every word must match subject, sender or recipients; `"phrase"`, `-word`. */
  query?: string;
  /** Substrings of the address or name, any-match (up to 20 each). */
  from?: string[];
  to?: string[];
  cc?: string[];
  bcc?: string[];
  hasAttachment?: boolean;
  /** `YYYY-MM-DD` (the whole day) or ISO 8601. */
  startDate?: string;
  endDate?: string;
}

export interface UpdateThreadOptions {
  /** Marks every message. */
  read?: boolean;
  folder?: MoveThreadFolder;
  /** Applies a label; labels cannot be removed through the API. */
  labelId?: string;
}

export interface RemoveThreadResponse {
  object: "inbox_thread";
  id: string;
  /** False when the thread was already in trash. */
  deleted: boolean;
}

export interface ThreadEmailAttachment {
  /** A UUID on received mail; the position ("0", "1", …) on mail the inbox sent. */
  id: string;
  filename: string | null;
  size: number | null;
}

/** Fields after `received_at` are MillionSend extensions. */
export interface ThreadEmail {
  id: string;
  direction: "inbound" | "outbound";
  /** `Name <address>` when the sender has a display name. */
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  reply_to: string[];
  subject: string | null;
  message_id: string | null;
  html: string | null;
  text: string | null;
  attachments: ThreadEmailAttachment[];
  read: boolean;
  received_at: string;
  /** Inbound only. */
  extracted_text?: string | null;
  screening?: Screening;
  spam_verdict?: SpamVerdict | null;
  virus_verdict?: VirusVerdict | null;
  /** Outbound only: the email's last delivery event. */
  status?: string;
}

export interface SentEmail extends ThreadEmail {
  email_id: string;
  thread_id: string | null;
  inbox_id: string | null;
}

// ---- inbox drafts --------------------------------------------------------
export type DraftStatus =
  | "draft"
  | "pending_approval"
  | "sent"
  | "rejected"
  | "expired"
  | (string & {});

/** Fields after `updated_at` are MillionSend extensions. */
export interface Draft {
  object: "inbox_draft";
  id: string;
  type: "standalone" | "reply";
  to: string[] | null;
  cc: string[];
  bcc: string[];
  subject: string | null;
  html: string | null;
  text: string | null;
  thread_id: string | null;
  reply_to_email_id: string | null;
  /** Set once sent. */
  email_id: string | null;
  created_at: string;
  updated_at: string;
  status: DraftStatus;
  /** Why it waits for a person, e.g. `send_policy`, `ramp`, `approval_required`. */
  approval_reasons: string[];
  forward: boolean;
  decided_by: string | null;
  decided_at: string | null;
  expires_at: string | null;
}

export interface DraftListItem {
  id: string;
  type: "standalone" | "reply";
  to: string[] | null;
  cc: string[];
  bcc: string[];
  subject: string | null;
  snippet: string | null;
  thread_id: string | null;
  reply_to_email_id: string | null;
  updated_at: string;
  status: DraftStatus;
  approval_reasons: string[];
}

export interface UpdateDraftOptions {
  /** null clears. */
  to?: Recipients | null;
  /** null or [] clears. */
  cc?: Recipients | null;
  bcc?: Recipients | null;
  subject?: string | null;
  /** Setting `html` or `text` replaces the whole body; the part you omit becomes null. */
  html?: string | null;
  text?: string | null;
}

export interface CreateDraftOptions extends UpdateDraftOptions {
  /** A reply draft names both the thread and the email it answers, or neither. */
  threadId?: string;
  replyToEmailId?: string;
}

export interface RemoveDraftResponse {
  object: "inbox_draft";
  id: string;
  deleted: true;
}

/** What `drafts.send` sent. */
export interface SentDraft {
  object: "inbox_draft";
  id: string;
  thread_id: string | null;
  email_id: string;
}

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
export interface SendEmailOptions {
  from: string;
  to: Recipients;
  subject: string;
  html?: string;
  text?: string;
  cc?: Recipients;
  bcc?: Recipients;
  replyTo?: Recipients;
  /** ISO 8601 with offset; up to 30 days ahead. */
  scheduledAt?: string;
  tags?: Tag[];
}

export interface CreateEmailResponse {
  id: string;
}

export interface Email {
  object: "email";
  id: string;
  from: string;
  to: string[];
  cc: string[] | null;
  bcc: string[] | null;
  reply_to: string[] | null;
  subject: string;
  html: string | null;
  text: string | null;
  created_at: string;
  scheduled_at: string | null;
  message_id: string;
  last_event: string;
  /** Best-practice score (0–10, one decimal); null when the email has no insights. */
  score: number | null;
}

export interface CancelEmailResponse {
  object: "email";
  id: string;
}

export interface BatchResponse {
  data: CreateEmailResponse[];
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
export interface CreateContactOptions {
  email: string;
  firstName?: string;
  lastName?: string;
  unsubscribed?: boolean;
  properties?: Record<string, string | number | boolean | null>;
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

export interface ContactId {
  object: "contact";
  id: string;
}

export interface Contact {
  object: "contact";
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  unsubscribed: boolean;
  properties: Record<string, string>;
}

export interface ContactListItem {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  unsubscribed: boolean;
}

export interface RemoveContactResponse {
  object: "contact";
  contact: string;
  deleted: true;
}

export type TopicSubscription = "opt_in" | "opt_out";

export interface ContactTopicUpdate {
  id: string;
  subscription: TopicSubscription;
}

export interface UpdateContactTopicsOptions extends ContactAddress {
  topics: ContactTopicUpdate[];
}

export interface UpdateContactTopicsResponse {
  id: string;
}

// ---- topics --------------------------------------------------------------
export interface CreateTopicOptions {
  name: string;
  description?: string;
  defaultSubscription: TopicSubscription;
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  default_subscription: TopicSubscription;
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
  topicId?: string | null;
}

export interface UpdateBroadcastOptions {
  name?: string;
  segmentId?: string;
  from?: string;
  subject?: string;
  html?: string;
  text?: string;
  replyTo?: Recipients;
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

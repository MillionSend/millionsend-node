# millionsend

Official Node.js / TypeScript SDK for [MillionSend](https://github.com/MillionSend/millionsend) — a self-hostable, Resend-compatible email API on AWS SES.

The API is wire-compatible with Resend, and this SDK deliberately mirrors the
shape of `resend`, so migrating is mostly a find-and-replace: swap the import
and the class name. MillionSend Cloud works with just the key; a self-hosted
instance sets its origin via `baseUrl`.

## Install

```bash
npm install millionsend
# or: pnpm add millionsend / yarn add millionsend / bun add millionsend
```

Requires Node.js 18+ (uses the global `fetch`).

## Quickstart

```ts
import { MillionSend } from "millionsend";

const ms = new MillionSend("ms_123"); // Cloud; self-hosted: { baseUrl: "https://mail.acme.dev" }

const { data, error } = await ms.emails.send({
  from: "Acme <onboarding@acme.dev>",
  to: "success@simulator.amazonses.com",
  subject: "Hello from MillionSend",
  html: "<strong>It works!</strong>",
});

if (error) {
  console.error(error.name, error.message);
} else {
  console.log("sent", data.id);
}
```

## Configuration

```ts
new MillionSend(apiKey?, {
  baseUrl?, // defaults to MILLIONSEND_BASE_URL, then MillionSend Cloud (https://api.millionsend.com)
  fetch?,   // custom fetch implementation (proxies, tests, custom agents)
  userAgent?, // extra User-Agent suffix
  timeoutMs?, // request deadline; defaults to 30,000 ms
  allowInsecureHttp?, // accept a non-loopback http:// baseUrl (default: refused)
});
```

- `apiKey` falls back to `process.env.MILLIONSEND_API_KEY`. Missing key → throws at construction.
- `baseUrl` falls back to `process.env.MILLIONSEND_BASE_URL`, then to MillionSend Cloud (`https://api.millionsend.com`). **Self-hosting? Set it to your instance's origin.**
- Plain `http://` is only accepted for loopback hosts (`localhost`, `127.0.0.1`, `::1`); any other `http://` URL throws at construction, since the API key is sent as a bearer header. Pass `allowInsecureHttp: true` to talk to a non-TLS instance elsewhere (e.g. inside a private network).

## Errors

No method throws for an API error — every call resolves to `{ data, error }`.
`error` is `null` on success; otherwise `{ name, message, statusCode, retryAfter }` where
`name` is a stable snake_case code you can switch on (`validation_error`,
`not_found`, `forbidden`, `restricted_api_key`, `rate_limit_exceeded`, `sending_paused`,
`all_recipients_suppressed`, …). Client-side and transport failures carry
`statusCode: null`. `retryAfter` is the response's `retry-after` header in seconds, or
`null` when it has none.

`emails.send` and `batch.send` answer `422 all_recipients_suppressed` when every
`to` recipient is on the suppression list or opted out of the send's `topicId`. From
MillionSend v0.15.1, an `emails.send` the suppression list alone refuses still leaves a
metadata-only `suppressed` email, which fires `email.suppressed`; each retry leaves
another, even with the same `idempotencyKey` (a refused send doesn't hold its key).

Inboxes add `inbox_send_policy` (403, a send the inbox's rules or the shared domain hold),
`inbox_send_cap_reached` (429, the inbox's or the team's daily cap), `approval_required` (403),
`email_quarantined` (403), `email_blocked` (410, a download of an email that carries malware),
`too_many_waits` (429, too many concurrent long-polls) and `name_review_unavailable` (503, a
name on the shared domain can't be reviewed yet).

```ts
const { data, error } = await ms.emails.get(id);
if (error?.name === "not_found") { /* … */ }
```

### Retries

The SDK never retries on its own. Worth retrying after `retryAfter` seconds:
`503 name_review_unavailable`, `429 too_many_waits`, and `429 rate_limit_exceeded` when
`retryAfter` is 60 or less (the per-minute limits). Not worth retrying in the same process:
`429 inbox_send_cap_reached` and the daily name-review budget (`429 rate_limit_exceeded`
with a `retryAfter` that runs to the next UTC midnight), and any 403, 404, 409 or 422. An
unknown route answers `404 not_found` (`application_error` from servers before v0.13.0).

Resend a send with the same `idempotencyKey`: a batch the API already accepted gets its
stored response back. A held draft (`kind: "draft"`) is not a failure; never resend it.
`inboxes.create` takes no idempotency key: after a 429 or 503 nothing was created, but
after a timeout a resend can create a second inbox. With a chosen `username`, a 409 on the
resend usually means the first attempt succeeded: read it with `inboxes.get(address)`.

## Resources

Inputs are camelCase and mapped to the wire's snake_case (`replyTo` → `reply_to`,
`scheduledAt` → `scheduled_at`, `topicId` → `topic_id`, …). Every field you pass
is sent; nothing is dropped client-side. Responses are the wire shape verbatim.
List endpoints take `{ limit, after, before }` (keyset cursors) and return
`{ object: "list", data, has_more }`. Lists run newest first (MillionSend v0.13.0 and
later): `after` takes the last id of a page and pages toward older items, `before` takes
the first id and pages toward newer ones, and `has_more` refers to that direction. Threads
sort by last activity, drafts by last update, a thread's emails run oldest first, and labels
and topics are not paginated.

```ts
// Incremental sync: page toward newer items, starting from the newest id you stored
let before = newestStoredId;
for (;;) {
  const { data } = await ms.emails.list({ before, limit: 100 });
  if (!data?.data.length) break;
  save(data.data);             // newest first within the page
  if (!data.has_more) break;
  before = data.data[0].id;
}
```

A cursor whose item was deleted answers `422 validation_error` (`404 not_found` on the
`inboxes` lists): start again without a cursor and stop at the ids you already have.

### Emails

```ts
await ms.emails.send({
  from: "Acme <onboarding@acme.dev>",
  to: ["ada@acme.dev"], cc, bcc, replyTo,
  subject: "Hello",
  html: "<p>Hi</p>", text: "Hi",
  scheduledAt: "2026-09-01T09:00:00Z",       // or "in 2 hours"
  tags: [{ name: "campaign", value: "launch" }],
  topicId,                                   // skip opted-out recipients, add unsubscribe link
  attachments: [{ filename: "hi.txt", content: Buffer.from("hi"), contentType: "text/plain" }],
  headers: { "X-Entity-Ref-ID": "123" },
}, { idempotencyKey });                      // POST /emails
await ms.emails.get(id);                     // GET /emails/:id (includes a nullable `score`)
await ms.emails.list({ limit: 50 });         // GET /emails
await ms.emails.update({ id, scheduledAt }); // PATCH /emails/:id (reschedule)
await ms.emails.cancel(id);                  // POST /emails/:id/cancel (scheduled only)
await ms.emails.remove(id);                  // DELETE /emails/:id
await ms.emails.getInsights(id);             // GET /emails/:id/insights (best-practice report)
```

`attachments[].content` is a base64 string or a `Buffer` (encoded for you).
`template` is sent through as-is; MillionSend answers `422` until templates can be sent.
`subject` takes up to 998 characters. A `to`, `cc` or `bcc` address on a domain that can
never receive mail (`example.com`, `.test`, `.invalid`, `.localhost`, a TLD that doesn't
exist, …) answers `422 validation_error`; to test sending without emailing anyone, use
`success@simulator.amazonses.com`. An inbox's address on the shared domain can be the
`from` too, under the rules in [Sending from the shared domain](#sending-from-the-shared-domain).

### Batch

```ts
const { data } = await ms.batch.send([payloadA, payloadB], {
  idempotencyKey,
  batchValidation: "permissive", // x-batch-validation; default "strict" rejects the whole batch
});
data.data;   // [{ id }] for the accepted emails
data.errors; // permissive only: [{ index, message }] for the rejected ones
```

Batch items never send from the shared domain: a strict batch fails with
`403 inbox_send_policy` (the message starts with `emails.<index>: `), a permissive one
lists the item in `errors`.

### Receiving

Mail received at your domains and inboxes. Everything in a received email was
written by its sender: show its `html` only in a sandbox, and hand an LLM the
`extracted_text` (hidden text, quotes and the signature removed) rather than `html`.

```ts
const { data } = await ms.emails.receiving.list({
  limit: 20,
  inboxId,                 // only mail delivered to this inbox
  from: "example.com",     // an address, or a domain covering its subdomains
  to, subjectContains, since, unread,
  wait: 30,                // long-poll: answer as soon as a match arrives, up to 50 s
});
data.data;  // newest first
data.held;  // with `wait`: [{ id, inbox_id, reason, quarantine_reason, created_at }] held for screening or quarantine

const { data: email } = await ms.emails.receiving.get(id, { htmlFormat: "cid" });
email.extracted_text;        // the new part as plain text, hidden text removed (still untrusted)
email.extracted?.code;       // a verification code, on inboxes with extract_codes
email.screening?.sender_trust; // owner | allowlisted | known_thread | external | unauthenticated | failed

await ms.emails.receiving.attachments.list(id);          // each with a signed download_url (1 hour)
await ms.emails.receiving.attachments.get(id, attachmentId);
await ms.emails.receiving.remove(id);                    // erase now (MillionSend extension)

// Reply and forward server-side (MillionSend extension). The inbox's rules may hold the
// message as a draft that waits for a person: the API answers 202 and `kind` is "draft".
const { data: outcome } = await ms.emails.receiving.reply(
  id,
  { text: "Thanks!", replyAll: false, requiresApproval: false },
  { idempotencyKey },
);
if (outcome?.kind === "draft") outcome.draft.approval_reasons; // e.g. ["send_policy"]
else outcome?.email.id;
await ms.emails.receiving.forward(id, { to: "ops@acme.dev", text: "FYI", mode: "attachment" });
```

Held mail never reaches an inbox-scoped key or an agent: reading it answers
`403 email_quarantined`. A full-access team key sees it with `includeQuarantined: true`.
`unread` needs `inboxId` with a team key; an inbox-scoped key reads its own inbox. An
`inboxId` that doesn't exist answers `404 not_found` at once, even with `wait`.

### Inboxes

An inbox is one address that receives mail, read by an agent (`kind: "agent"`,
the default) or by people (`kind: "human"`). Threads, labels, drafts and their
paths mirror Resend's Inboxes beta; safety rules, quarantine and codes are
MillionSend extensions.

```ts
const { data: inbox } = await ms.inboxes.create({
  name: "Signup bot",       // no emailAddress: an address on the shared domain
  username: "signup-bot",   // signup-bot@<team>.<shared domain>; omit it for a random one
  expiresIn: "24h",         // "1h" to "365d"; omitted or null, it never expires
  safety: { acceptFrom: "anyone" },
});
await ms.inboxes.create({ emailAddress: "support@acme.dev", name: "Support", kind: "human" });
await ms.inboxes.create({ domainId, username: "orders" }); // a domains.list id: orders@ that domain
await ms.inboxes.list({ kind: "agent" });
await ms.inboxes.get("support@acme.dev");                 // by id or address
await ms.inboxes.update(inbox.id, { fromName: "Acme", expiresIn: "7d" });
await ms.inboxes.remove(inbox.id);                        // also revokes its inbox-scoped keys

// Codes and sign-in links, without parsing HTML (wait long-polls up to 50 s)
const { data: code } = await ms.inboxes.codes.latest(inbox.id, { from: "github.com", wait: 30 });
code.status; // "found" | "none" | "ambiguous" | "timeout"; code.code, code.url
// The next sign-in: only a code received after the one already used
await ms.inboxes.codes.latest(inbox.id, { since: code.received_at, wait: 30 });

// Safety rules: who can write in, what the inbox may send
await ms.inboxes.safety.get(inbox.id);
await ms.inboxes.safety.update(inbox.id, { acceptFrom: "allowlist", allowlist: ["*@acme.dev"], sendCap: 50 });

// Quarantine: held mail, kept until a person releases it
await ms.inboxes.quarantine.list(inbox.id);
await ms.inboxes.quarantine.release(inbox.id, emailId, { trustSender: true });

// Threads and their messages
await ms.inboxes.threads.list(inbox.id, { folders: ["inbox", "archive"], read: false });
await ms.inboxes.threads.list(inbox.id, { includeQuarantined: true }); // owner views: a `quarantined` count per thread
await ms.inboxes.threads.search(inbox.id, { query: "invoice", from: ["example.com"] });
await ms.inboxes.threads.get(inbox.id, threadId);
await ms.inboxes.threads.update(inbox.id, threadId, { read: true, folder: "archive", labelId });
await ms.inboxes.threads.remove(inbox.id, threadId);      // to trash, purged after 30 days
await ms.inboxes.threads.emails.list(inbox.id, threadId); // oldest first; includeQuarantined for owner views
await ms.inboxes.threads.emails.get(inbox.id, threadId, emailId);
await ms.inboxes.threads.emails.reply(inbox.id, threadId, emailId, { text: "Done." }, { idempotencyKey });
await ms.inboxes.threads.emails.forward(inbox.id, threadId, emailId, { to: "ops@acme.dev" });

// Labels (up to 100 per inbox)
await ms.inboxes.labels.create(inbox.id, { name: "Billing", color: "#FF8800" });
await ms.inboxes.labels.list(inbox.id);
await ms.inboxes.labels.update(inbox.id, labelId, { name: "Invoices" });
await ms.inboxes.labels.remove(inbox.id, labelId);

// Drafts, and the ones that wait for approval
await ms.inboxes.drafts.create(inbox.id, { to: "ada@acme.dev", subject: "Hi", text: "…" });
await ms.inboxes.drafts.list(inbox.id);
await ms.inboxes.drafts.get(inbox.id, draftId);
await ms.inboxes.drafts.update(inbox.id, draftId, { cc: null });  // null clears
await ms.inboxes.drafts.send(inbox.id, draftId, { idempotencyKey }); // { kind: "sent" | "draft" }
await ms.inboxes.drafts.reject(inbox.id, draftId);
await ms.inboxes.drafts.remove(inbox.id, draftId);
```

Replies, forwards and `drafts.send` resolve to `{ kind: "sent", email }` or, when
the inbox's rules hold the message for a person (HTTP 202), `{ kind: "draft", draft }`.
An agent's reply to a Reply-To at another organization is held that way too, with
`"reply_to_redirect"` among its `approval_reasons`.
A key restricted to the inbox cannot send a draft that waits for approval
(`403 approval_required`); a person in the dashboard or a full-access team key approves it.
Hosted agent settings (`/inboxes/:id/agent`) are not exposed: MillionSend runs no agent of its own.

An inbox never expires unless `expiresIn` says so, and its `name` takes up to 320
characters. `domainId` takes a `domains.list` row instead of `emailAddress`: the
`shared: true` row works like leaving both out, and one of your own domains needs a
`username`.

On the shared domain, an inbox unused for 90 days (no mail in or out, no API call on it)
is deleted, which fires `inbox.expired`, then `inbox.deleted`. A chosen `username` or
`fromName` there is reviewed first: reserved names (`postmaster`, `admin`, `support`,
`noreply`, …), a `fwd-` prefix and look-alikes of brands answer `422`, a username in use
`409`, and `429` means today's review budget is spent. `503 name_review_unavailable`
means try again after `retryAfter` seconds: the review is down, or the team's new
subdomain still waits for its own, and then every shared or forwarding create gets it.
Safety rules differ there too: `sendPolicy: "allowlist"` answers `422`, and so does
`"open"` unless the team's `sending_mode` is `open`; `ownerAddresses` don't make senders
trusted; `forwardTo` takes team members only.

#### Sending from the shared domain

What the team's shared addresses may send is the `sending_mode` of the `shared: true` row
of `domains.list`: `open` starts conversations, `reply_only` only answers inside a thread
to its own correspondents, and `receive_only` sends nothing. The same answers come back
from `emails.send`, replies, forwards and drafts:

- `403 inbox_send_policy`: the mode doesn't allow this send (or the inbox's name looks
  like a brand, which only replies even under `open`);
- `429 inbox_send_cap_reached`: the team's daily cap for the shared domain, with a
  `retryAfter` that runs to the next UTC midnight;
- `422 validation_error`: more than 10 distinct recipients across `to`, `cc` and `bcc`.

`emails.send` takes a shared address in `open` mode only: the inbox's exact
`email_address` (no +tag), a display name left out or equal to its `from_name`, and no
`replyTo`, `attachments`, `headers` or `scheduledAt`. A key restricted to a domain gets
`403 restricted_api_key`. Batch items and broadcasts never send from the shared domain.
Switch on `name` and `statusCode`; the messages may change.

### Contacts

Contacts are team-global — one list per team, no audiences.

```ts
await ms.contacts.create({
  email: "ada@acme.dev", firstName: "Ada", lastName: "Lovelace",
  unsubscribed: false, properties: { plan: "pro" },
  segments: [{ id: segmentId }],
  topics: [{ id: topicId, subscription: "opt_in" }],
});
await ms.contacts.get({ email });                  // by id or email (email wins)
await ms.contacts.get(contactId);                  // bare string works too
await ms.contacts.update({ id, unsubscribed: true, firstName: null }); // null clears
await ms.contacts.remove({ email });               // the contact's emails stay in the send log
await ms.contacts.remove({ email }, { erase: true }); // ?erase=true also scrubs the address from
                                                      // email history, events and API logs (GDPR/LGPD)
await ms.contacts.list({ limit: 50 });
await ms.contacts.list({ segmentId });             // GET /segments/:id/contacts
// Bulk read (MillionSend extension): attach properties and topic subscriptions to every item,
// so an audience reads in one request per 100 contacts instead of one per contact
await ms.contacts.list({ limit: 100, include: ["properties", "topics"] });

// Hosted preference page (MillionSend extension): the same page the unsubscribe links open.
// The URL is a non-expiring, contact-scoped capability — show it only to the contact.
const { data } = await ms.contacts.preferencesLink({ email }); // POST /contacts/:id/preferences-link
data.url; // 422 when the instance cannot mint links (APP_BASE_URL unset)

// Bulk create (MillionSend extension): up to 1000 per call
const { data } = await ms.contacts.batch.create(items, {
  onConflict: "upsert",          // ?on_conflict=error|skip|upsert
  batchValidation: "permissive", // x-batch-validation
});
data.data;   // [{ index, id, status: "created" | "updated" | "skipped" }]
data.counts; // { created, updated, skipped, failed }
data.errors; // permissive only: [{ index, statusCode, name, message }], as strict mode would answer

// Bulk lookup (MillionSend extension): up to 1000 contacts by id or email in one request,
// in request order; unknown entries are listed, not errors — one request against the rate limit
const { data } = await ms.contacts.batch.get([contactId, { email }], { include: ["topics"] });
data.data;    // [{ object: "contact", id, email, ..., topics }] — the contacts found
data.missing; // [{ index, email }] — request entries that matched nobody

// Bulk delete (MillionSend extension): up to 1000 per call, by ids or by emails.
// Their emails stay in the send log; erase: true also scrubs each address from email history
const { data } = await ms.contacts.batch.remove({ emails, erase: true }); // or { ids }
data.data; // [{ object: "contact", contact, deleted: true }] — only the rows actually deleted

// Segment membership
await ms.contacts.segments.add({ email, segmentId });
await ms.contacts.segments.remove({ id: contactId, segmentId });

// Topic subscriptions (granular unsubscribe)
await ms.contacts.topics.update({ email, topics: [{ id: topicId, subscription: "opt_out" }] });
const { data } = await ms.contacts.topics.list({ email }); // GET /contacts/:id/topics, unpaginated
data.data; // [{ id, name, description, subscription: "opt_in" | "opt_out", explicit, visibility }]
           // `subscription` is the effective choice; `explicit: false` means it is the topic default
```

`contact.properties` on `get` is typed per property: `{ plan: { type: "string", value: "pro" } }`.

### Contact properties

```ts
await ms.contactProperties.create({ key: "plan", type: "string", fallbackValue: "free" });
await ms.contactProperties.list();
await ms.contactProperties.get(id);
await ms.contactProperties.update({ id, fallbackValue: null }); // null clears
await ms.contactProperties.remove(id);
```

### Topics

```ts
await ms.topics.create({ name: "Product updates", defaultSubscription: "opt_in", visibility: "public" });
await ms.topics.get(id);
await ms.topics.list();     // { object: "list", data, has_more: false } — topics are unpaginated
await ms.topics.update(id, { name: "Product news" });
await ms.topics.remove(id);
```

### Broadcasts

Target a `segmentId` and/or `topicId`; omit both to send to all contacts.

```ts
const { data } = await ms.broadcasts.create({
  name: "Launch", segmentId, from: "Acme <news@acme.dev>", subject: "Launch",
  html: "<p>Hi {{{FIRST_NAME|there}}}</p>", previewText: "It's here",
  send: true, scheduledAt: "in 1 hour",   // omit `send` to save a draft
});
await ms.broadcasts.list();
await ms.broadcasts.get(id);
await ms.broadcasts.update(id, { subject: "Launch 🚀", topicId: null });  // draft only; null clears
await ms.broadcasts.send(id, { scheduledAt: "2026-09-01T09:00:00Z" }); // omit to send now
await ms.broadcasts.cancel(id);   // scheduled only
await ms.broadcasts.remove(id);   // draft only
```

`subject` takes up to 998 characters. A broadcast never sends from the shared domain:
`create({ send: true })` and `send` answer `403 inbox_send_policy`.

### Suppressions

```ts
await ms.suppressions.add({ email: "bounced@acme.dev", origin: "manual" }); // `create` is an alias
await ms.suppressions.list({ origin: "bounce", limit: 100 });
await ms.suppressions.get(idOrEmail);
await ms.suppressions.remove(idOrEmail);
await ms.suppressions.batch.add({ emails, origin: "unsubscribe" });   // up to 1000
await ms.suppressions.batch.remove({ emails });                       // or { ids }
```

### Domains

```ts
const { data } = await ms.domains.create({
  name: "acme.dev", region: "us-east-1", customReturnPath: "send",
  openTracking: true, clickTracking: true, trackingSubdomain: "links",
});
data.records; // DNS records to publish
await ms.domains.list();
await ms.domains.get(id);
await ms.domains.verify(id);
await ms.domains.update({ id, clickTracking: false, trackingSubdomain: null }); // null clears
await ms.domains.update({ id, receivingCatchAll: true }); // accept mail for addresses without an inbox
await ms.domains.remove(id);
```

On an instance with a shared inbox domain, the team's subdomain of it is the last row of
`domains.list` (`shared: true`; MillionSend v0.14.0 and later). It is verified, has no DNS
records, and its id is the `domainId` of the team's shared inboxes. Its `sending_mode`
(`open`, `reply_only` or `receive_only`) says what those inboxes may send, and
`sending_mode_reason` (`plan` or `instance`, `null` under `open`) why it is held below
`open`. It is read-only: `update`, `verify` and `remove` answer `403 forbidden`, and an API
key can't be restricted to it. It comes after every own domain whatever its `created_at`,
alone on the next page when they exactly fill one. A team whose new subdomain still waits
for its name review has no such row yet. Older servers send no `shared`: read it as `false`.

It sends only from its inboxes' own addresses, so leave it out when picking a domain to send from:

```ts
const { data } = await ms.domains.list({ limit: 100 });
const sender = data?.data.find((d) => d.status === "verified" && !d.shared);
```

### Webhooks

```ts
const { data } = await ms.webhooks.create({
  endpoint: "https://acme.dev/hooks/millionsend",
  events: ["email.delivered", "email.bounced"],
  signingSecret: "whsec_…", // optional: keep an existing secret
});
data.signing_secret;
await ms.webhooks.list();
await ms.webhooks.get(id);   // includes signing_secret and previous_secret_expires_at
await ms.webhooks.update(id, { status: "disabled" });
await ms.webhooks.remove(id);

// Rotate the signing secret (MillionSend extension). During `overlapHours` (0–72, default 24)
// every delivery carries both signatures, so the receiver can switch without a gap.
const { data } = await ms.webhooks.rotate(id, { overlapHours: 24 }); // or { signingSecret: "whsec_…" }
data.signing_secret; data.previous_secret_expires_at; // null when the old secret is dropped at once
```

Subscribable events include `email.*` (with `email.scheduled`, `email.failed`,
`email.suppressed`, `email.prefetched` and `email.received`), `deliverability.*`,
`quota.*`, `contact.*` (`created`, `updated`, `deleted`, `unsubscribed`,
`resubscribed`, `topic_opt_in`, `topic_opt_out`), `suppression.added` /
`suppression.removed`, and the `inbox.*` events (`inbox.created`, `inbox.updated`,
`inbox.deleted`, `inbox.expired`, `inbox.thread.created`, `inbox.thread.folder.updated`,
`inbox.thread.labels.updated`, `inbox.email.received`, `inbox.email.sent`,
`inbox.email.quarantined`, `inbox.draft.created`, `inbox.draft.updated`,
`inbox.draft.sent`, `inbox.draft.deleted`). `email.prefetched` and inbox events reach
only endpoints that list them by name. `inboxIds` limits an endpoint's inbox events
and `email.received` to those inboxes (`null` = every inbox). Inbox events from sends
made in the dashboard carry `data.source: "dashboard"`.

`email.scheduled`, `email.failed` and `email.suppressed` need MillionSend v0.15.1 or later:
an older server answers `422 validation_error` to a webhook that names one. Unlike inbox
events, they also reach endpoints subscribed to every event.

- `email.scheduled`: accepted with a future `scheduledAt`; no extra `data`. Rescheduling
  with `emails.update` fires nothing.
- `email.failed`: it won't be sent, or SES refused it after `email.sent`.
  `data.failed.reason` is `domain_not_verified`, `domain_deleted`, `body_missing`,
  `body_unreadable`, `message_rejected`, `retries_exhausted`, `send_interrupted` or
  `provider_error` (any other error).
- `email.suppressed`: it won't be sent. `data.suppressed` is `{ type, message, reason }`:
  `type` is `OnAccountSuppressionList`, `Unsubscribed` or `Ineligible`, and `reason` is
  `recipient_suppressed`, `contact_unsubscribed`, `topic_unsubscribed`, `contact_missing`,
  `contact_recipient_mismatch`, `broadcast_missing`, `topic_missing` or `ineligible`. An
  `emails.send` the suppression list alone refuses with `422 all_recipients_suppressed`
  fires it too.

New `reason` and `type` values can appear. From v0.15.1, `suppression.added` and
`suppression.removed` carry `data.source_id`: the email whose bounce or complaint created
the entry, or `null`.

### API keys

```ts
const { data } = await ms.apiKeys.create({ name: "ci", permission: "sending_access", domainId });
data.token; // shown once
await ms.apiKeys.create({ name: "signup-agent", permission: "full_access", inboxId }); // one inbox only
await ms.apiKeys.list();
await ms.apiKeys.remove(id);
```

An inbox-scoped key reads only its inbox and sends only from its address; any other
route answers `403 restricted_api_key`. `domainId` takes one of your own domains: the
`shared: true` row of `domains.list` answers `422 validation_error`.

### Templates

`id` arguments accept the template id or its alias.

```ts
await ms.templates.create({ name: "Welcome", html: "<p>Hi</p>", subject: "Welcome!", alias: "welcome" });
await ms.templates.list();
await ms.templates.get("welcome");
await ms.templates.update("welcome", { subject: null, alias: null }); // null clears
await ms.templates.duplicate(id);
await ms.templates.publish(id);   // no-op: every save is live (kept for Resend compatibility)
await ms.templates.remove(id);
```

### Segments (MillionSend extension)

Dynamic segments are a saved filter over the team's contacts — a MillionSend
superset with no Resend equivalent.

```ts
await ms.segments.create({
  name: "Pro plan",
  filter: { match: "all", conditions: [{ field: "property:plan", op: "equals", value: "pro" }] },
});
await ms.segments.get(id);   // includes a live contact_count
await ms.segments.list();
await ms.segments.update(id, { name: "Pro tier" });
await ms.segments.remove(id);
```

### Deliverability (MillionSend extension)

The account-level deliverability score over the trailing 30 days. Scores are
0–10 (`null` until there is enough data); per-email reports live on
`ms.emails.getInsights(id)`.

```ts
const { data } = await ms.deliverability.get();
// data.score, data.band, data.complaint_rate, data.guardrail_status, …
```

### Usage (MillionSend extension)

```ts
const { data } = await ms.usage.get();
// data.plan, data.limits.emails_per_day, data.today.emails_sent, data.today.resets_at
```

## Migrating from Resend

```diff
- import { Resend } from "resend";
- const resend = new Resend("re_123");
+ import { MillionSend } from "millionsend";
+ const ms = new MillionSend("ms_123"); // self-hosted: add { baseUrl: "https://mail.acme.dev" }
```

Method names, payloads and request options (`idempotencyKey`, `batchValidation`)
match `resend`. Notes:

- **No audiences.** Contacts are team-global, so `.audiences` calls have no
  equivalent — drop them and call `.contacts` directly. The API keeps
  `/audiences/*` routes as a compatibility shim, but the SDK does not expose them.
  For subsets of contacts, use `.segments` (dynamic filters) or topics.
- **Templates** cannot be sent yet: `emails.send({ template })` is forwarded and
  answered with `422`. `templates.publish` is a no-op (every save is live).
- **MillionSend extensions** (no Resend counterpart): `segments`,
  `deliverability`, `usage`, `emails.getInsights`, `contacts.batch`,
  `contacts.preferencesLink`, `webhooks.rotate`, the `origin` field on
  suppressions, `emails.receiving.reply` / `remove`, `inboxes.safety`,
  `inboxes.codes`, `inboxes.quarantine`, `inboxes.drafts.reject`, the `username` and
  `domainId` of `inboxes.create`, and `error.retryAfter`.
- **`emails.receiving.forward(id, payload)`** forwards server-side, from your
  inbox or domain, instead of Resend's client-side re-send of the raw message.
- **Inboxes** follow Resend's preview shapes with ids as positional arguments
  (`ms.inboxes.threads.emails.reply(inboxId, threadId, emailId, payload)`), and
  return the full object on create.

## License

MIT

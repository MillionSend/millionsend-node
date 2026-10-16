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
`error` is `null` on success; otherwise `{ name, message, statusCode }` where
`name` is a stable snake_case code you can switch on (`validation_error`,
`not_found`, `restricted_api_key`, `sending_paused`,
`all_recipients_suppressed`, …). Client-side and transport failures carry
`statusCode: null`.

`emails.send` and `batch.send` answer `422 all_recipients_suppressed` when every
`to` recipient is on the suppression list or opted out of the send's `topicId`.

Inboxes add `inbox_send_policy` (403, a send the inbox's rules hold), `inbox_send_cap_reached`
(429, the inbox's daily cap), `approval_required` (403), `email_quarantined` (403),
`email_blocked` (410, a download of an email that carries malware) and `too_many_waits`
(429, too many concurrent long-polls).

```ts
const { data, error } = await ms.emails.get(id);
if (error?.name === "not_found") { /* … */ }
```

## Resources

Inputs are camelCase and mapped to the wire's snake_case (`replyTo` → `reply_to`,
`scheduledAt` → `scheduled_at`, `topicId` → `topic_id`, …). Every field you pass
is sent; nothing is dropped client-side. Responses are the wire shape verbatim.
List endpoints take `{ limit, after, before }` (keyset cursors) and return
`{ object: "list", data, has_more }`.

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

### Batch

```ts
const { data } = await ms.batch.send([payloadA, payloadB], {
  idempotencyKey,
  batchValidation: "permissive", // x-batch-validation; default "strict" rejects the whole batch
});
data.data;   // [{ id }] for the accepted emails
data.errors; // permissive only: [{ index, message }] for the rejected ones
```

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

### Inboxes

An inbox is one address that receives mail, read by an agent (`kind: "agent"`,
the default) or by people (`kind: "human"`). Threads, labels, drafts and their
paths mirror Resend's Inboxes beta; safety rules, quarantine and codes are
MillionSend extensions.

```ts
const { data: inbox } = await ms.inboxes.create({
  name: "Signup bot",       // no emailAddress: a random address on the shared domain
  expiresIn: "24h",         // `<n>h` or `<n>d`; null = never (custom domains only)
  safety: { acceptFrom: "anyone" },
});
await ms.inboxes.create({ emailAddress: "support@acme.dev", name: "Support", kind: "human" });
await ms.inboxes.list({ kind: "agent" });
await ms.inboxes.get("support@acme.dev");                 // by id or address
await ms.inboxes.update(inbox.id, { fromName: "Acme", expiresIn: "7d" });
await ms.inboxes.remove(inbox.id);                        // also revokes its inbox-scoped keys

// Codes and sign-in links, without parsing HTML (wait long-polls up to 50 s)
const { data: code } = await ms.inboxes.codes.latest(inbox.id, { from: "github.com", wait: 30 });
code.status; // "found" | "none" | "ambiguous" | "timeout"; code.code, code.url

// Safety rules: who can write in, what the inbox may send
await ms.inboxes.safety.get(inbox.id);
await ms.inboxes.safety.update(inbox.id, { acceptFrom: "allowlist", allowlist: ["*@acme.dev"], sendCap: 50 });

// Quarantine: held mail, kept until a person releases it
await ms.inboxes.quarantine.list(inbox.id);
await ms.inboxes.quarantine.release(inbox.id, emailId, { trustSender: true });

// Threads and their messages
await ms.inboxes.threads.list(inbox.id, { folders: ["inbox", "archive"], read: false });
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
await ms.inboxes.drafts.create(inbox.id, { to: "ada@example.com", subject: "Hi", text: "…" });
await ms.inboxes.drafts.list(inbox.id);
await ms.inboxes.drafts.get(inbox.id, draftId);
await ms.inboxes.drafts.update(inbox.id, draftId, { cc: null });  // null clears
await ms.inboxes.drafts.send(inbox.id, draftId, { idempotencyKey }); // { kind: "sent" | "draft" }
await ms.inboxes.drafts.reject(inbox.id, draftId);
await ms.inboxes.drafts.remove(inbox.id, draftId);
```

Replies, forwards and `drafts.send` resolve to `{ kind: "sent", email }` or, when
the inbox's rules hold the message for a person (HTTP 202), `{ kind: "draft", draft }`.
A key restricted to the inbox cannot send a draft that waits for approval
(`403 approval_required`); a person in the dashboard or a full-access team key approves it.
Hosted agent settings (`/inboxes/:id/agent`) are not exposed: MillionSend runs no agent of its own.

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
data.errors; // permissive only

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

Subscribable events include `email.*` (with `email.received`), `deliverability.*`,
`quota.*`, `contact.*` (`created`, `updated`, `deleted`, `unsubscribed`,
`resubscribed`, `topic_opt_in`, `topic_opt_out`), `suppression.added` /
`suppression.removed`, and the `inbox.*` events (`inbox.created`, `inbox.updated`,
`inbox.deleted`, `inbox.expired`, `inbox.thread.created`, `inbox.thread.folder.updated`,
`inbox.thread.labels.updated`, `inbox.email.received`, `inbox.email.sent`,
`inbox.email.quarantined`, `inbox.draft.created`, `inbox.draft.updated`,
`inbox.draft.sent`, `inbox.draft.deleted`). Inbox events reach only endpoints that
list them by name. `inboxIds` limits an endpoint's inbox events and `email.received`
to those inboxes (`null` = every inbox).

### API keys

```ts
const { data } = await ms.apiKeys.create({ name: "ci", permission: "sending_access", domainId });
data.token; // shown once
await ms.apiKeys.create({ name: "signup-agent", permission: "full_access", inboxId }); // one inbox only
await ms.apiKeys.list();
await ms.apiKeys.remove(id);
```

An inbox-scoped key reads only its inbox and sends only from its address; any other
route answers `403 restricted_api_key`.

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
  suppressions, `emails.receiving.reply` / `remove`, and `inboxes.safety`,
  `inboxes.codes`, `inboxes.quarantine` and `inboxes.drafts.reject`.
- **`emails.receiving.forward(id, payload)`** forwards server-side, from your
  inbox or domain, instead of Resend's client-side re-send of the raw message.
- **Inboxes** follow Resend's preview shapes with ids as positional arguments
  (`ms.inboxes.threads.emails.reply(inboxId, threadId, emailId, payload)`), and
  return the full object on create.

## License

MIT

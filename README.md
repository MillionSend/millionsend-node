# millionsend

Official Node.js / TypeScript SDK for [MillionSend](https://github.com/MillionSend/millionsend) — a self-hostable, Resend-compatible email API on AWS SES.

The API is wire-compatible with Resend, and this SDK deliberately mirrors the
shape of `resend`, so migrating is mostly a find-and-replace: swap the import,
the class name, and point `baseUrl` at your instance.

## Install

```bash
npm install millionsend
# or: pnpm add millionsend / yarn add millionsend / bun add millionsend
```

Requires Node.js 18+ (uses the global `fetch`).

## Quickstart

```ts
import { MillionSend } from "millionsend";

const ms = new MillionSend("ms_123", { baseUrl: "https://mail.acme.dev" });

const { data, error } = await ms.emails.send({
  from: "Acme <onboarding@acme.dev>",
  to: "delivered@resend.dev",
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
  baseUrl?, // your instance URL; defaults to MILLIONSEND_BASE_URL, then http://localhost:3001
  fetch?,   // custom fetch implementation (proxies, tests, custom agents)
  userAgent?, // extra User-Agent suffix
  timeoutMs?, // request deadline; defaults to 30,000 ms
  allowInsecureHttp?, // accept a non-loopback http:// baseUrl (default: refused)
});
```

- `apiKey` falls back to `process.env.MILLIONSEND_API_KEY`. Missing key → throws at construction.
- `baseUrl` falls back to `process.env.MILLIONSEND_BASE_URL`. MillionSend is self-hosted, so **set this to your deployment in production.**
- Plain `http://` is only accepted for loopback hosts (`localhost`, `127.0.0.1`, `::1`); any other `http://` URL throws at construction, since the API key is sent as a bearer header. Pass `allowInsecureHttp: true` to talk to a non-TLS instance elsewhere (e.g. inside a private network).

## Errors

No method throws for an API error — every call resolves to `{ data, error }`.
`error` is `null` on success; otherwise `{ name, message, statusCode }` where
`name` is a stable snake_case code you can switch on (`validation_error`,
`not_found`, `restricted_api_key`, `sending_paused`, …). Client-side and
transport failures carry `statusCode: null`.

```ts
const { data, error } = await ms.emails.get(id);
if (error?.name === "not_found") { /* … */ }
```

## Resources

### Emails

```ts
await ms.emails.send(payload, { idempotencyKey });   // POST /emails
await ms.emails.get(id);                               // GET /emails/:id (includes a nullable `score`)
await ms.emails.getInsights(id);                       // GET /emails/:id/insights (best-practice report)
await ms.emails.cancel(id);                            // POST /emails/:id/cancel (scheduled only)
await ms.batch.send([payloadA, payloadB], { idempotencyKey }); // up to 100
```

Send options are camelCase and mapped to the wire: `replyTo` → `reply_to`,
`scheduledAt` → `scheduled_at`. `to`/`cc`/`bcc`/`replyTo` accept a string or an array.

### Contacts

Contacts are team-global — one list per team, no audiences.

```ts
await ms.contacts.create({ email: "ada@acme.dev", firstName: "Ada",
                           properties: { plan: "pro" } });
await ms.contacts.get({ email });                  // by id or email (email wins)
await ms.contacts.get(contactId);                  // bare string works too
await ms.contacts.update({ id, unsubscribed: true, firstName: null }); // null clears
await ms.contacts.remove({ email });
await ms.contacts.list({ limit: 50 });

// Topic subscriptions (granular unsubscribe)
await ms.contacts.topics.update({ email, topics: [{ id: topicId, subscription: "opt_out" }] });
```

### Topics

```ts
await ms.topics.create({ name: "Product updates", defaultSubscription: "opt_in" });
await ms.topics.get(id);
await ms.topics.list();     // bare { data } — topics are unpaginated
await ms.topics.remove(id);
```

### Broadcasts

Target a `segmentId` and/or `topicId`; omit both to send to all contacts.

```ts
const { data } = await ms.broadcasts.create({
  segmentId, from: "Acme <news@acme.dev>", subject: "Launch",
  html: "<p>Hi {{{FIRST_NAME|there}}}</p>",
});
await ms.broadcasts.list();
await ms.broadcasts.get(id);
await ms.broadcasts.update(id, { subject: "Launch 🚀" });  // draft only
await ms.broadcasts.send(id, { scheduledAt: "2026-09-01T09:00:00Z" }); // omit to send now
await ms.broadcasts.cancel(id);   // scheduled only
await ms.broadcasts.remove(id);   // draft only
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

## Migrating from Resend

```diff
- import { Resend } from "resend";
- const resend = new Resend("re_123");
+ import { MillionSend } from "millionsend";
+ const ms = new MillionSend("ms_123", { baseUrl: "https://mail.acme.dev" });
```

Method names and payloads match. Notes:

- **Domains and API keys** are managed in the MillionSend dashboard, not via the API, so there are no `.domains`/`.apiKeys` resources here.
- **No audiences.** Contacts are team-global, so `.audiences` calls have no equivalent — drop them and call `.contacts` directly. For subsets of contacts, use `.segments` (dynamic filters) or topics.

## License

MIT

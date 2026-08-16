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
});
```

- `apiKey` falls back to `process.env.MILLIONSEND_API_KEY`. Missing key → throws at construction.
- `baseUrl` falls back to `process.env.MILLIONSEND_BASE_URL`. MillionSend is self-hosted, so **set this to your deployment in production.**

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
await ms.emails.get(id);                               // GET /emails/:id
await ms.emails.cancel(id);                            // POST /emails/:id/cancel (scheduled only)
await ms.batch.send([payloadA, payloadB], { idempotencyKey }); // up to 100
```

Send options are camelCase and mapped to the wire: `replyTo` → `reply_to`,
`scheduledAt` → `scheduled_at`. `to`/`cc`/`bcc`/`replyTo` accept a string or an array.

### Audiences & contacts

```ts
const { data: audience } = await ms.audiences.create({ name: "Registered users" });
await ms.audiences.list({ limit: 20, after });
await ms.audiences.get(id);
await ms.audiences.remove(id);

await ms.contacts.create({ audienceId, email: "ada@acme.dev", firstName: "Ada",
                           properties: { plan: "pro" } });
await ms.contacts.get({ audienceId, email });     // by id or email (email wins)
await ms.contacts.get(contactId);                  // bare string works too
await ms.contacts.update({ id, unsubscribed: true, firstName: null }); // null clears
await ms.contacts.remove({ email });
await ms.contacts.list({ audienceId, limit: 50 });

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

```ts
const { data } = await ms.broadcasts.create({
  audienceId, from: "Acme <news@acme.dev>", subject: "Launch",
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

Dynamic segments are a saved filter over an audience's contacts — a MillionSend
superset with no Resend equivalent.

```ts
await ms.segments.create({
  name: "Pro plan",
  audienceId,
  filter: { match: "all", conditions: [{ field: "property:plan", op: "equals", value: "pro" }] },
});
await ms.segments.get(id);   // includes a live contact_count
await ms.segments.list();
await ms.segments.update(id, { name: "Pro tier" });
await ms.segments.remove(id);
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
- Resend's `.segments` is an alias of audiences; MillionSend's `.segments` is the distinct dynamic-filter feature. Use `.audiences` for a straight port.

## License

MIT

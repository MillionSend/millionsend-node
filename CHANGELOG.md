# Changelog

Versions follow the MillionSend API they target; the API stays wire-compatible with Resend.

## 0.10.0 — 2026-10-17

- `WebhookEvent` names `email.scheduled`, `email.failed` and `email.suppressed`.
- The README covers their `data` (`failed.reason`; `suppressed.type`, `message` and `reason`), the `source_id` that `suppression.added` and `suppression.removed` carry, and the `suppressed` email kept when the suppression list alone refuses an `emails.send`.
- `WebhookEvent` names the opt-in `email.prefetched` too: it reaches only endpoints that list it.

Each feature needs this MillionSend version or later: an older instance refuses a webhook that names one of the three events with `422 validation_error`.

| MillionSend | Features |
|---|---|
| v0.15.1 | `email.scheduled`, `email.failed` and `email.suppressed`; `source_id` on `suppression.added` and `suppression.removed`; the `suppressed` email kept when the suppression list refuses an `emails.send` |

## 0.9.0 — 2026-10-16

- `emails.receiving`: `list` (with `wait` long-polling and the `inboxId`, `to`, `from`, `since`, `subjectContains`, `unread`, `includeQuarantined` and `quarantined` filters), `get`, `reply`, `forward`, `remove`, and `attachments.list` / `attachments.get`.
- `inboxes`: `create`, `list`, `get`, `update`, `remove`, plus `safety`, `codes.latest`, `quarantine`, `labels`, `threads` (with `threads.emails`) and `drafts` (with `send` and `reject`).
- Replies, forwards and `drafts.send` resolve to `{ kind: "sent", email }`, or `{ kind: "draft", draft }` when the API holds the message for approval (HTTP 202).
- A request with `wait` gets a deadline that outlasts it, so long-polls past `timeoutMs` no longer abort.
- An id that is empty, `.` or `..` resolves to `{ error: { name: "validation_error", statusCode: null } }` without a request: URL normalization would have sent it to another resource.
- The long-poll's `held` items carry `reason` (`pending` or `quarantined`) and `quarantine_reason`.
- `WebhookEvent` names `email.received` and the 14 `inbox.*` events; webhooks take `inboxIds`; `apiKeys.create` takes `inboxId`; `domains.update` takes `receivingCatchAll`; `Domain`, `ApiKeyListItem`, `WebhookListItem` and `Usage.limits` gain `receiving_catch_all`, `inbox_id`, `inbox_ids` and `inboxes`.
- `inboxes.create` takes `username` (the part before the @) and `domainId` (a `domains.list` row instead of `emailAddress`); `inboxes.codes.latest` takes `since`; thread list and search items carry an optional `quarantined` count.
- Domains carry `shared`; the team's shared row, listed last by `domains.list`, adds `sending_mode` (`DomainSendingMode`) and `sending_mode_reason`.
- Every `ErrorResponse` carries `retryAfter`: the `retry-after` header in seconds, or `null`. A deep-equality check on `error` needs the new key.
- Contacts batch `errors` items are `BatchContactError`, with the `statusCode` and `name` strict mode would answer.
- The README covers newest-first lists and their cursors, retries, the shared domain's row, sending rules and refusals, and the recipients the API refuses.

Each feature needs this MillionSend version or later. Older instances answer 404 on paths they lack and ignore options they don't know, so an inbox created with `username` or `domainId` on one can get another address: check its `email_address`.

| MillionSend | Features |
|---|---|
| v0.10.0 | `inboxes`; the receiving long-poll, inbox filters, `reply` and `forward` |
| v0.11.0 | `422` for recipients that can never receive mail; a batch `idempotencyKey` replayed before validation |
| v0.12.0 | `username`; inboxes that never expire by default; sends from the shared domain under its mode; `name_review_unavailable`; `statusCode` and `name` on contacts batch errors |
| v0.13.0 | newest-first lists; `since` on `codes.latest`; `quarantined` on thread items; inbox names up to 320 characters; `unread` with an inbox-scoped key; a JSON 404 for unknown routes |
| v0.14.0 | `shared`, `sending_mode` and `sending_mode_reason` on domains; `domainId` on `inboxes.create`; `subject` up to 998 characters |

## 0.8.0 — 2026-09-08

- `contacts.remove(address, { erase: true })` and `contacts.batch.remove({ ids | emails, erase: true })` also scrub the address from email history, event payloads and API logs (`?erase=true` on the single delete, body `erase` on the batch) — a GDPR/LGPD erasure. Without `erase` a delete keeps the contact's emails in the send log, as before. Responses are unchanged. Needs MillionSend v0.6.54.

## 0.7.0 — 2026-09-05

- `contacts.list({ include: ["properties", "topics"] })` attaches the property map and the topic subscriptions to every item (`?include=`), on the team list and on `segmentId` lists alike. Without `include` the item is unchanged.
- `contacts.batch.get(addresses, { include })` reads up to 1000 contacts by id or email in one request via `POST /contacts/batch/get`; entries that match no contact are returned under `missing`.
- `ContactListItem` gains optional `properties` and `topics`; `batch.get` returns `BatchGetContact` (the list item plus `object: "contact"`). Existing types are unchanged. Needs MillionSend v0.6.36 or later.

## 0.6.0 — 2026-09-04

- `contacts.batch.remove(...)` posts ids or emails to `POST /contacts/batch/remove` (bulk delete).
- `contacts.preferencesLink(idOrEmail)` mints the contact's hosted preference page URL via `POST /contacts/{id}/preferences-link`.
- `webhooks.rotate(id, { overlap? })` swaps the signing secret with an optional overlap window during which both secrets verify; the webhook detail carries `previous_secret_expires_at`.
- Contact topic rows carry `visibility`.
- The `WebhookEvent` union names the `contact.*` and `suppression.*` events and `quota.paused`.
- `PATCH /contacts/{id}` `properties` are documented as merged with `null` removing a key; the API enforces that from v0.6.35.

## 0.5.0 and earlier

See the git history; no changelog was kept before 0.6.0.

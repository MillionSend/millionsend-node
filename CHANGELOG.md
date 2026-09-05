# Changelog

Versions follow the MillionSend API they target; the API stays wire-compatible with Resend.

## 0.6.0 — 2026-09-04

- `contacts.batch.remove(...)` posts ids or emails to `POST /contacts/batch/remove` (bulk delete).
- `contacts.preferencesLink(idOrEmail)` mints the contact's hosted preference page URL via `POST /contacts/{id}/preferences-link`.
- `webhooks.rotate(id, { overlap? })` swaps the signing secret with an optional overlap window during which both secrets verify; the webhook detail carries `previous_secret_expires_at`.
- Contact topic rows carry `visibility`.
- The `WebhookEvent` union names the `contact.*` and `suppression.*` events and `quota.paused`.
- `PATCH /contacts/{id}` `properties` are documented as merged with `null` removing a key; the API enforces that from v0.6.35.

## 0.5.0 and earlier

See the git history; no changelog was kept before 0.6.0.

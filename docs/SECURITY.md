# Security notes

| Area | Implementation |
|---|---|
| Tenant isolation | Postgres RLS on every org table; helpers in non-exposed `private` schema; tested in `tests/db` (cross-org read/write/delete, self-join, escalation, anon) |
| AuthN | Supabase Auth (e-mail verification, password reset, Google); `getClaims()` validates JWT signatures in `proxy.ts` and server code |
| AuthZ | Roles enforced by RLS **and** `requireRole()` in every server action; owner role cannot be granted/changed via client; `is_super_admin` writable only by service role; `/admin` returns 404 to non-admins |
| Secrets | Service-role key only in server modules (`server-only`); integration secrets AES-256-GCM encrypted, ciphertext column not selectable by clients |
| Public endpoints | Honeypot, schema validation, per-IP/per-key rate limit, consent required, identical responses for new/duplicate/suppressed, org derived from key |
| Webhooks | Inbound: HMAC-SHA256 timing-safe verification; Stripe: `constructEvent` signature + tolerance; Cron: bearer secret, timing-safe |
| Outbound | HTTPS-only, DNS-resolved public-IP check (SSRF), no redirects, 10 s timeout |
| Messaging safety | Consent + suppression + hourly caps + auto unsubscribe link; AI drafts never auto-send |
| Output | CSV export neutralises formula injection; React escapes output; CSP not yet enforced (add per deployment) |
| Headers | HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy |
| Privacy | Consent evidence per lead, suppression list, org data export (JSON), org deletion cascade, audit log |

## Before going live
Independent security review / pen-test, CSP tuning, Sentry (`SENTRY_DSN`) wiring, backups/PITR on Supabase, legal review of Privacy/Terms templates, DPA with sub-processors, review GDPR/PECR/CAN-SPAM duties for your markets.

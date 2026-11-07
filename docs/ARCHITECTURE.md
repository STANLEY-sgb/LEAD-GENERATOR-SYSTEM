# LeadPilot – Architecture, decisions & checklist

## Overview
Next.js 16 (App Router, `proxy.ts`) + Supabase (Postgres, Auth, RLS). Interactive requests stay thin; discovery, scoring side-effects and automation run as queued jobs.

```
src/app            routes: (auth) (marketing) (app) admin onboarding invite f unsubscribe api/*
src/components     ui primitives, layout shell, charts, auth forms
src/lib            supabase clients, org-context, actions/* (server actions), leads/* (normalize, scoring, ingest),
                   connectors, automation (conditions, engine, ssrf), queue, ai, billing, crypto, notify, email
supabase/migrations  0001 foundation · 0002 lead engine+CRM · 0003 jobs/automation/campaigns · 0004 billing/integrations
                     0005 ingest_lead · 0006 profile email
tests/db           real-Postgres (PGlite) RLS / ingestion / queue / invitation tests
docs               SETUP, ARCHITECTURE, API (openapi.yaml), SECURITY, DEPLOYMENT
```

## Key decisions
- **Tenant isolation in Postgres**: every org table has RLS using `private.is_member / has_role` (SECURITY DEFINER, non-exposed schema). Client-supplied org IDs never grant access; server actions resolve org + role from the session. `anon` has no table privileges.
- **Atomic lead ingestion** (`ingest_lead` SQL function, service-role only): suppression check → exact normalized-e-mail dedupe → insert + score + history + activity → *candidate* flagging for shared phone/company domain (never auto-merged).
- **Postgres job queue** (`jobs` + `claim_jobs` with `FOR UPDATE SKIP LOCKED`): no extra infra on Supabase; priorities, per-org concurrency cap of 3, exponential backoff, dead-letter, stale-job recovery, idempotency keys. `src/lib/queue` is a small interface so Redis/BullMQ can replace it. Work is triggered by Vercel Cron → `/api/worker/tick`, plus opportunistic `after()` ticks.
- **Idempotent automation**: `unique(workflow_id, idempotency_key)` + event job keys ⇒ an event runs a workflow once. Loop guard (event depth ≤ 3), ≤10 actions/workflow, 500 executions/org/hour, 50 e-mails/org/hour, SSRF-safe HTTPS-only webhooks.
- **Entitlements are server-side**: `consume()` atomically increments `usage_records` and rolls back when over the plan limit; count limits (workflows, campaigns, seats) checked on create and in `accept_invitation`.
- **Scoring is deterministic and explainable** (`src/lib/leads/scoring.ts`), with per-factor evidence labels (verified / inferred / unverified / missing). AI generates *briefs and drafts only*, labelled as AI output.
- **No fake integrations**: only Google Places, forms, signed inbound webhook and CSV are implemented. Meta/LinkedIn/TikTok/YouTube/Google Ads/SMS are listed as "Not connected" with the reason.
- **Rate limiting** on public endpoints is per-instance in memory (burst/bot protection); hard guarantees are in the DB. Swap for Redis (`REDIS_URL`) for strict multi-instance limits.
- **Multi-org users**: the app uses the user's first membership as the active org (org switcher is a future enhancement).

## Phase status
- [x] P1 Foundation · [x] P2 Business config + ICP (AI draft → human approval)
- [x] P3 Lead engine: connectors, normalization, dedupe, scoring, leads UI, forms, webhook, CSV, discovery
- [x] P4 CRM: pipeline (drag & drop, custom stages), lead detail, notes/activity/tasks, team & invitations
- [x] P5 Automation: queue, workers, workflow builder (triggers/conditions/actions), execution log, retry
- [x] P6 AI assistant, lead briefs
- [x] P7 Analytics, dashboard, campaigns
- [x] P8 Integrations center, notifications, Stripe billing, usage/entitlements
- [x] P9 Super admin (overview, orgs, users, plans, system, audit, settings)
- [~] P10 Hardening: security headers, RLS tests, unit tests, docs done. **Not done**: browser E2E run, real load test, Sentry wiring, penetration test, legal review of policies.

## Known limitations / future work
Calendar sync, SMS, OAuth-based ad-platform connectors (need partner approvals), MFA enrolment UI (Supabase MFA APIs available), org switcher, manual duplicate merge UI, Redis queue/limiter, vector search for semantic matching.

# Setup (Supabase + Vercel)

Do these in order. Each step has a check so nothing fails silently.

## 1. Supabase project
1. Create a project at supabase.com. Note the **Project URL**, **Publishable key** and **Secret (service_role) key** (Project Settings → API).
2. Copy `.env.example` → `.env.local` and fill at minimum:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only)
   - `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)
   - `CRON_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` (generate with `openssl rand -base64 32`)

## 2. Apply the database schema
Apply **all** files in `supabase/migrations/` in filename order:
- CLI: `supabase link --project-ref <ref> && supabase db push`
- or paste each file into the Supabase SQL editor, oldest first.

The migrations were verified end-to-end against a real Postgres engine (PGlite) by `npm test` (see `tests/db`).

## 3. Auth settings (Authentication → URL Configuration)
- Site URL: your deployed URL (or `http://localhost:3000`).
- Redirect URLs: `<site>/auth/callback` for every environment.
- Google (optional): enable the provider and add the OAuth client ID/secret.
- Recommended: enable e-mail confirmation (default) and configure SMTP for production volumes.

## 4. Verify
Run `npm run dev`, then open `/api/health`. Expected: `{"healthy":true,"database":"ok",...}`.
- `database: "not_configured"` → missing env vars (the app shows `/setup` until set).
- `database: "schema_missing"` → migrations not applied (step 2).
- `database: "unreachable"` → wrong URL/key.

## 5. Create your first Super Admin
Register normally, then in the Supabase SQL editor (service role):
```sql
update public.profiles set is_super_admin = true where email = 'you@yourcompany.com';
```
A **Platform admin** link appears in the sidebar. Clients cannot set this flag (column-level grants).

## 6. Vercel
1. Import the GitHub repo; set Root Directory to `app` if the repo root is the parent folder.
2. Add all env vars (Production + Preview). `NEXT_PUBLIC_APP_URL` = your production URL.
3. `vercel.json` registers a cron calling `/api/worker/tick` every minute (Vercel Pro; on Hobby use an external scheduler, e.g. GitHub Actions / cron-job.org, with header `Authorization: Bearer $CRON_SECRET`). Without cron, queued work still runs opportunistically after user actions.
4. Add the production URL to the Supabase redirect list.

## 7. Optional services (each feature shows an honest "not configured" state until set)
| Variable(s) | Enables |
|---|---|
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | ICP suggestions, AI lead briefs, assistant |
| `RESEND_API_KEY`, `EMAIL_FROM` | notification e-mails, invitations, consent-based automation e-mails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | checkout, portal, invoices. Create products/prices in Stripe, then `update public.plans set stripe_price_id='price_…' where id='growth';`. Webhook events: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed` |
| `GOOGLE_PLACES_API_KEY` | Google Places discovery connector |

## Node version
Developed on Node 20.18. Tailwind is pinned to 4.1.x and `magic-string` to 0.30.x because Node < 20.19/22.12 cannot `require()` ESM. On Node 22+ you may upgrade both.

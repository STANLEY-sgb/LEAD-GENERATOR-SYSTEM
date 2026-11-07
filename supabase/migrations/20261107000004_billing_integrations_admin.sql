-- Phase 8/9: plans, subscriptions, usage, integrations, notification prefs, admin.

create table public.plans (
  id text primary key, name text not null, price_cents int not null default 0,
  limits jsonb not null, features text[] not null default '{}',
  stripe_price_id text, active boolean not null default true, sort int not null default 0
);
insert into public.plans (id, name, price_cents, limits, features, sort) values
 ('starter','Starter',0,'{"leads_per_month":100,"members":2,"workflows":1,"ai_calls_per_month":50,"campaigns":1,"discovery_runs_per_month":10}','{Basic lead discovery,Basic CRM,Limited integrations}',1),
 ('growth','Growth',4900,'{"leads_per_month":1000,"members":5,"workflows":10,"ai_calls_per_month":1000,"campaigns":5,"discovery_runs_per_month":100}','{AI lead qualification,More workflows,Advanced analytics,Team collaboration}',2),
 ('professional','Professional',14900,'{"leads_per_month":10000,"members":15,"workflows":50,"ai_calls_per_month":10000,"campaigns":25,"discovery_runs_per_month":1000}','{Advanced integrations,Advanced automation,Campaign management}',3),
 ('enterprise','Enterprise',0,'{"leads_per_month":1000000,"members":1000,"workflows":1000,"ai_calls_per_month":1000000,"campaigns":1000,"discovery_runs_per_month":100000}','{Custom limits,Priority support,Custom integrations,Enterprise reporting}',4);

create table public.subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_id text not null references public.plans(id) default 'starter',
  status text not null default 'active' check (status in ('active','trialing','past_due','canceled')),
  stripe_customer_id text unique, stripe_subscription_id text unique,
  current_period_end timestamptz, limit_overrides jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_invoice_id text unique, amount_cents int not null, currency text not null default 'usd',
  status text not null, hosted_url text, created_at timestamptz not null default now()
);
create index on public.invoices (organization_id, created_at desc);

create table public.usage_records (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'), metric text not null,
  quantity bigint not null default 0,
  primary key (organization_id, period, metric)
);
-- Atomic counter; returns the NEW total so callers can compare against the limit without a race.
create or replace function public.increment_usage(p_org uuid, p_metric text, p_qty int default 1) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint; per text := to_char(now() at time zone 'utc', 'YYYY-MM');
begin
  insert into public.usage_records (organization_id, period, metric, quantity) values (p_org, per, p_metric, p_qty)
  on conflict (organization_id, period, metric) do update set quantity = public.usage_records.quantity + excluded.quantity
  returning quantity into v;
  return v;
end $$;
revoke execute on function public.increment_usage(uuid, text, int) from public, anon, authenticated;

create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null, ciphertext text not null,   -- AES-256-GCM, key in CREDENTIAL_ENCRYPTION_KEY (never in DB)
  scopes text[] not null default '{}', status text not null default 'connected' check (status in ('connected','expired','revoked','error')),
  expires_at timestamptz, created_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  in_app boolean not null default true, email boolean not null default true, sms boolean not null default false,
  high_priority_leads boolean not null default true, automation_failures boolean not null default true,
  primary key (user_id, organization_id)
);

do $$ declare t text; begin
  foreach t in array array['subscriptions','invoices','usage_records','integration_credentials','notification_preferences'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
alter table public.plans enable row level security;
create policy plans_read on public.plans for select to authenticated using (active);
create policy subs_sel on public.subscriptions for select to authenticated using (private.is_member(organization_id) or private.is_super_admin());
create policy inv_sel on public.invoices for select to authenticated using (private.has_role(organization_id, array['owner','admin']::public.org_role[]) or private.is_super_admin());
create policy usage_sel on public.usage_records for select to authenticated using (private.is_member(organization_id) or private.is_super_admin());
-- Secrets are never readable by clients: only non-secret columns are granted.
revoke select on public.integration_credentials from authenticated;
grant select (id, organization_id, provider, scopes, status, expires_at, created_at) on public.integration_credentials to authenticated;
create policy cred_sel on public.integration_credentials for select to authenticated using (private.is_member(organization_id));
create policy prefs_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()) and private.is_member(organization_id))
  with check (user_id = (select auth.uid()) and private.is_member(organization_id));
-- Billing state changes only through Stripe webhooks / admin (service role): no client write policies.
revoke insert, update, delete on public.subscriptions, public.invoices, public.usage_records, public.plans from authenticated;

-- Super-admin read access to platform-wide data (writes always go through audited service-role server code).
create policy members_super_sel on public.organization_members for select to authenticated using (private.is_super_admin());

-- Every new org starts on Starter.
create or replace function public.create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.organizations (name, slug, created_by) values (p_name, p_slug, v_uid) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.business_profiles (organization_id) values (v_org);
  insert into public.scoring_configs (organization_id) values (v_org);
  insert into public.subscriptions (organization_id, plan_id) values (v_org, 'starter');
  insert into public.pipeline_stages (organization_id, name, position, kind)
  select v_org, s.name, s.ord, s.kind from (values
    ('New Lead',1,'open'),('Qualified',2,'open'),('Contacted',3,'open'),('Interested',4,'open'),('Meeting Scheduled',5,'open'),
    ('Proposal Sent',6,'open'),('Negotiation',7,'open'),('Converted',8,'won'),('Lost',9,'lost')) as s(name, ord, kind);
  return v_org;
end $$;
revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- Accepting an invitation: validates token + e-mail match server-side, atomically.
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.organization_invitations; v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select email into v_email from auth.users where id = auth.uid();
  select * into inv from public.organization_invitations
   where token = p_token and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'invitation invalid or expired'; end if;
  if lower(inv.email) <> lower(v_email) then raise exception 'invitation was issued to a different e-mail address'; end if;
  if (select count(*) from public.organization_members where organization_id = inv.organization_id)
     >= coalesce((select (coalesce(s.limit_overrides->>'members', p.limits->>'members'))::int
                  from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = inv.organization_id), 2) then
    raise exception 'member limit reached for this plan';
  end if;
  insert into public.organization_members (organization_id, user_id, role) values (inv.organization_id, auth.uid(), inv.role)
  on conflict (organization_id, user_id) do nothing;
  update public.organization_invitations set accepted_at = now() where id = inv.id;
  return inv.organization_id;
end $$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

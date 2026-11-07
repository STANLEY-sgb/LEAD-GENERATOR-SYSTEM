-- Phase 5-7: job queue (Postgres-backed), automation, campaigns, assistant.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  type text not null, payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','dead')),
  priority int not null default 0, attempts int not null default 0, max_attempts int not null default 5,
  run_at timestamptz not null default now(), locked_at timestamptz, locked_by text,
  idempotency_key text unique, last_error text,
  created_at timestamptz not null default now(), finished_at timestamptz
);
create index jobs_claim_idx on public.jobs (priority desc, run_at) where status = 'queued';
create index jobs_org_running on public.jobs (organization_id) where status = 'running';
alter table public.jobs enable row level security;
create policy jobs_admin_sel on public.jobs for select to authenticated
  using (organization_id is not null and private.has_role(organization_id, array['owner','admin']::public.org_role[]) or private.is_super_admin());

-- Atomically claims runnable jobs. SKIP LOCKED lets any number of workers poll in parallel; a per-org cap of 3
-- concurrent jobs stops one tenant from monopolising workers (fair usage).
create or replace function public.claim_jobs(p_limit int, p_worker text) returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with ranked as (
    select j.id, j.organization_id,
           row_number() over (partition by j.organization_id order by j.priority desc, j.run_at) as rn,
           (select count(*) from public.jobs r where r.organization_id = j.organization_id and r.status = 'running') as running
    from public.jobs j where j.status = 'queued' and j.run_at <= now()
  ), eligible as (
    select id from ranked where organization_id is null or rn <= 3 - running
  ), candidates as (
    select j.id from public.jobs j join eligible e on e.id = j.id
    where j.status = 'queued'
    order by j.priority desc, j.run_at
    limit p_limit for update of j skip locked)
  update public.jobs u set status = 'running', locked_at = now(), locked_by = p_worker, attempts = u.attempts + 1
  from candidates c where u.id = c.id returning u.*;
end $$;

-- Jobs stuck in 'running' (worker crashed / serverless timeout) go back to the queue or to the dead-letter state.
create or replace function public.requeue_stale_jobs(p_older_than interval default interval '10 minutes') returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.jobs set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
         locked_at = null, locked_by = null, last_error = coalesce(last_error, 'worker timed out'),
         run_at = now() + (interval '30 seconds' * power(2, least(attempts, 8)))
  where status = 'running' and locked_at < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.claim_jobs(int, text), public.requeue_stale_jobs(interval) from public, anon, authenticated;

create table public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120), description text,
  trigger_type text not null check (trigger_type in ('lead.created','lead.captured','lead.scored','lead.stage_changed','lead.stale','schedule')),
  trigger_config jsonb not null default '{}',
  conditions jsonb not null default '[]', actions jsonb not null default '[]',
  active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.automation_workflows (organization_id, trigger_type) where active;
create trigger trg_wf_updated before update on public.automation_workflows for each row execute function public.set_updated_at();

create table public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'running' check (status in ('running','succeeded','failed','skipped')),
  idempotency_key text not null, error text,
  started_at timestamptz not null default now(), finished_at timestamptz,
  unique (workflow_id, idempotency_key)   -- same event can never run a workflow twice
);
create index on public.automation_executions (organization_id, started_at desc);

create table public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_id uuid not null references public.automation_executions(id) on delete cascade,
  step int not null, action text not null, status text not null, message text,
  created_at timestamptz not null default now()
);
create index on public.automation_logs (execution_id, step);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120), description text,
  product_ids uuid[] not null default '{}', target_audience text,
  markets text[] not null default '{}', sources text[] not null default '{}', keywords text[] not null default '{}',
  min_score int not null default 0 check (min_score between 0 and 100),
  starts_at date, ends_at date, daily_limit int not null default 50 check (daily_limit between 1 and 10000),
  status text not null default 'draft' check (status in ('draft','active','paused','stopped')),
  spend numeric check (spend is null or spend >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.campaigns (organization_id, status);
create trigger trg_campaigns_updated before update on public.campaigns for each row execute function public.set_updated_at();
alter table public.leads add constraint leads_campaign_fk foreign key (campaign_id) references public.campaigns(id) on delete set null;
create index leads_org_campaign on public.leads (organization_id, campaign_id) where campaign_id is not null;

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')), content text not null,
  created_at timestamptz not null default now()
);
create index on public.ai_messages (organization_id, user_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['automation_workflows','automation_executions','automation_logs','campaigns'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(organization_id) or private.is_super_admin())', t || '_sel', t);
  end loop;
  foreach t in array array['automation_workflows','campaigns'] loop
    execute format('create policy %I on public.%I for all to authenticated using (private.has_role(organization_id, private.manage_roles())) with check (private.has_role(organization_id, private.manage_roles()))', t || '_mg', t);
  end loop;
end $$;
-- executions/logs are written by the worker (service role) only.

alter table public.ai_messages enable row level security;
create policy ai_messages_own on public.ai_messages for all to authenticated
  using (user_id = (select auth.uid()) and private.is_member(organization_id))
  with check (user_id = (select auth.uid()) and private.is_member(organization_id));

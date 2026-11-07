-- Phase 3/4: lead engine + CRM.

-- Anonymous visitors never touch tables directly: public forms go through server routes (service role).
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

create or replace function private.write_roles() returns public.org_role[] language sql immutable as
  $$ select array['owner','admin','sales_manager','sales_rep']::public.org_role[] $$;
create or replace function private.manage_roles() returns public.org_role[] language sql immutable as
  $$ select array['owner','admin','sales_manager']::public.org_role[] $$;
grant execute on function private.write_roles(), private.manage_roles() to authenticated;

-- ---------- pipeline ----------
create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position int not null,
  kind text not null default 'open' check (kind in ('open','won','lost')),
  created_at timestamptz not null default now()
);
create index on public.pipeline_stages (organization_id, position);

alter table public.leads
  add column phone_normalized text,
  add column domain_normalized text,
  add column stage_id uuid references public.pipeline_stages(id) on delete set null,
  add column est_value numeric check (est_value is null or est_value >= 0),
  add column consent_status text not null default 'unknown' check (consent_status in ('unknown','granted','denied','withdrawn')),
  add column consent_evidence jsonb not null default '{}',
  add column legal_basis text,
  add column last_verified_at timestamptz,
  add column field_provenance jsonb not null default '{}',
  add column campaign_id uuid,
  add column lost_reason text,
  add column converted_at timestamptz,
  add column ai_summary jsonb;

-- Exact normalized e-mail identifies a person; phone/domain only raise duplicate *candidates* (never auto-merged).
create unique index leads_org_email_uniq on public.leads (organization_id, email_normalized)
  where email_normalized is not null and deleted_at is null;
create index leads_org_phone on public.leads (organization_id, phone_normalized) where phone_normalized is not null;
create index leads_org_domain on public.leads (organization_id, domain_normalized) where domain_normalized is not null;
create index leads_org_stage on public.leads (organization_id, stage_id) where deleted_at is null;
create index leads_org_score on public.leads (organization_id, score desc nulls last) where deleted_at is null;
create index leads_org_assigned on public.leads (organization_id, assigned_to) where deleted_at is null;

create table public.lead_sources_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source text not null, source_ref text, attribution text, raw jsonb not null default '{}',
  seen_at timestamptz not null default now()
);
create index on public.lead_sources_history (lead_id);

create table public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  score int not null check (score between 0 and 100),
  qualification text not null check (qualification in ('hot','warm','cold','unqualified')),
  factors jsonb not null, explanation text not null, method text not null default 'rules-v1',
  created_at timestamptz not null default now()
);
create index on public.lead_scores (lead_id, created_at desc);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null, body text, metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.lead_activities (lead_id, created_at desc);
create index on public.lead_activities (organization_id, created_at desc);

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index on public.lead_notes (lead_id, created_at desc);

create table public.lead_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 40),
  unique (lead_id, tag)
);
create index on public.lead_tags (organization_id, tag);

create table public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  other_lead_id uuid not null references public.leads(id) on delete cascade,
  reason text not null, status text not null default 'pending' check (status in ('pending','dismissed','merged')),
  created_at timestamptz not null default now(),
  unique (lead_id, other_lead_id), check (lead_id <> other_lead_id)
);

create table public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email_normalized text, phone_normalized text, reason text,
  created_at timestamptz not null default now(),
  check (email_normalized is not null or phone_normalized is not null)
);
create unique index on public.suppression_list (organization_id, email_normalized) where email_normalized is not null;
create unique index on public.suppression_list (organization_id, phone_normalized) where phone_normalized is not null;

create table public.scoring_configs (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  weights jsonb not null default '{"relevance":25,"geography":15,"industry":10,"profile":15,"intent":15,"completeness":10,"recency":5,"source":5}',
  hot_threshold int not null default 75 check (hot_threshold between 1 and 100),
  warm_threshold int not null default 50 check (warm_threshold between 1 and 100),
  cold_threshold int not null default 25 check (cold_threshold between 0 and 100),
  updated_at timestamptz not null default now(),
  check (hot_threshold > warm_threshold and warm_threshold > cold_threshold)
);

create table public.lead_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  public_key text not null unique default encode(gen_random_bytes(12), 'hex'),
  heading text, consent_text text not null default 'I agree to be contacted about this enquiry.',
  collect_phone boolean not null default true, collect_company boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.lead_forms (organization_id);

-- Connector configuration per organization (secrets live in integration_credentials, never here).
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector text not null, enabled boolean not null default false,
  config jsonb not null default '{}', last_run_at timestamptz, last_error text,
  created_at timestamptz not null default now(),
  unique (organization_id, connector)
);

create table public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector text not null, query jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  found int not null default 0, created int not null default 0, duplicates int not null default 0, error text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), finished_at timestamptz
);
create index on public.discovery_runs (organization_id, created_at desc);

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  type text not null default 'follow_up' check (type in ('call','email','meeting','follow_up','review')),
  title text not null check (char_length(title) between 1 and 200),
  due_at timestamptz not null, completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.follow_up_tasks (organization_id, due_at) where completed_at is null;
create index on public.follow_up_tasks (assigned_to, due_at) where completed_at is null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, title text not null, body text, link text,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ---------- RLS: read = any member; write = sales roles (analysts read-only) ----------
do $$
declare t text;
begin
  foreach t in array array['lead_sources_history','lead_scores','lead_activities','lead_notes','lead_tags','duplicate_candidates',
                           'follow_up_tasks','pipeline_stages','suppression_list','scoring_configs','lead_forms','lead_sources','discovery_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(organization_id) or private.is_super_admin())', t || '_sel', t);
  end loop;
  -- sales roles may write CRM records
  foreach t in array array['lead_notes','lead_tags','duplicate_candidates','follow_up_tasks','suppression_list'] loop
    execute format('create policy %I on public.%I for all to authenticated using (private.has_role(organization_id, private.write_roles())) with check (private.has_role(organization_id, private.write_roles()))', t || '_wr', t);
  end loop;
  -- configuration needs a manager
  foreach t in array array['pipeline_stages','scoring_configs','lead_forms','lead_sources'] loop
    execute format('create policy %I on public.%I for all to authenticated using (private.has_role(organization_id, private.manage_roles())) with check (private.has_role(organization_id, private.manage_roles()))', t || '_mg', t);
  end loop;
end $$;
-- activities/scores/history/discovery runs are append-only from the client side's perspective
create policy lead_activities_ins on public.lead_activities for insert to authenticated
  with check (private.has_role(organization_id, private.write_roles()) and actor_id = (select auth.uid()));
create policy discovery_runs_ins on public.discovery_runs for insert to authenticated
  with check (private.has_role(organization_id, private.manage_roles()) and created_by = (select auth.uid()));

alter table public.notifications enable row level security;
create policy notifications_own_sel on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_own_upd on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- A lead's stage must belong to the same organization (RLS alone cannot see cross-row FK abuse).
create or replace function private.check_lead_refs() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stage_id is not null and not exists (select 1 from public.pipeline_stages s where s.id = new.stage_id and s.organization_id = new.organization_id) then
    raise exception 'stage belongs to another organization' using errcode = '23514';
  end if;
  if new.assigned_to is not null and not exists (select 1 from public.organization_members m where m.user_id = new.assigned_to and m.organization_id = new.organization_id) then
    raise exception 'assignee is not a member of this organization' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_leads_refs before insert or update of stage_id, assigned_to on public.leads
  for each row execute function private.check_lead_refs();

-- ---------- org creation now seeds the default pipeline + scoring config ----------
create or replace function public.create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.organizations (name, slug, created_by) values (p_name, p_slug, v_uid) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.business_profiles (organization_id) values (v_org);
  insert into public.scoring_configs (organization_id) values (v_org);
  insert into public.pipeline_stages (organization_id, name, position, kind)
  select v_org, s.name, s.ord, s.kind from (values
    ('New Lead',1,'open'),('Qualified',2,'open'),('Contacted',3,'open'),('Interested',4,'open'),('Meeting Scheduled',5,'open'),
    ('Proposal Sent',6,'open'),('Negotiation',7,'open'),('Converted',8,'won'),('Lost',9,'lost')) as s(name, ord, kind);
  return v_org;
end $$;

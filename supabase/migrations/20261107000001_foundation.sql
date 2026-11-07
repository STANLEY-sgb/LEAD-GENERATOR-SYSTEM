-- Phase 1 foundation: identity, multi-tenancy, RLS.
create extension if not exists pgcrypto;
create schema if not exists private;

create type public.org_role as enum ('owner','admin','sales_manager','sales_rep','analyst');

create or replace function public.set_updated_at() returns trigger language plpgsql
set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  is_super_admin boolean not null default false,  -- changeable only via service role
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.handle_new_user() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- organizations ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  logo_url text,
  status text not null default 'active' check (status in ('active','suspended')),
  onboarding_completed boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_orgs_updated before update on public.organizations for each row execute function public.set_updated_at();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on public.organization_members (user_id);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null check (role <> 'owner'),
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.organization_invitations (organization_id);

-- ---------- business config tables (declared before create_organization references them) ----------
create table public.business_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  business_email text, phone text, website text, location text, industry text,
  description text, org_size text,
  target_countries text[] not null default '{}',
  preferred_sources text[] not null default '{}',
  contact_preferences jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create trigger trg_bp_updated before update on public.business_profiles for each row execute function public.set_updated_at();

create table public.products_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text, category text,
  price_min numeric, price_max numeric,
  target_audience text, benefits text[] not null default '{}',
  geographic_availability text[] not null default '{}',
  keywords text[] not null default '{}', search_phrases text[] not null default '{}',
  competitors text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.products_services (organization_id) where deleted_at is null;
create trigger trg_ps_updated before update on public.products_services for each row execute function public.set_updated_at();

create table public.ideal_customer_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, segments text[] not null default '{}', industries text[] not null default '{}',
  buyer_roles text[] not null default '{}', regions text[] not null default '{}',
  pain_points text[] not null default '{}', keywords text[] not null default '{}',
  intent_signals text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','active')),  -- AI output needs approval
  approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.ideal_customer_profiles (organization_id);
create trigger trg_icp_updated before update on public.ideal_customer_profiles for each row execute function public.set_updated_at();

-- ---------- leads (core; connectors/scoring land in Phase 3) ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, company text, email text, phone text, website text,
  country text, industry text, source text not null default 'manual',
  score int check (score between 0 and 100),
  qualification text not null default 'unqualified' check (qualification in ('hot','warm','cold','unqualified')),
  status text not null default 'new',
  assigned_to uuid references auth.users(id),
  email_normalized text generated always as (lower(btrim(email))) stored,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.leads (organization_id, created_at desc) where deleted_at is null;
create index on public.leads (organization_id, qualification) where deleted_at is null;
create index on public.leads (organization_id, email_normalized);
create trigger trg_leads_updated before update on public.leads for each row execute function public.set_updated_at();

-- ---------- platform ----------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null, entity text, entity_id text, metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_logs (organization_id, created_at desc);

create table public.platform_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());

-- ---------- RLS helpers (private schema: not exposed through the Data API) ----------
create or replace function private.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m
                 where m.organization_id = org and m.user_id = (select auth.uid()));
$$;
create or replace function private.has_role(org uuid, roles public.org_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m
                 where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = any(roles));
$$;
create or replace function private.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_super_admin from public.profiles where id = (select auth.uid())), false);
$$;
revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_member(uuid), private.has_role(uuid, public.org_role[]), private.is_super_admin() to authenticated;

-- ---------- atomic org creation (client never supplies owner/role) ----------
create or replace function public.create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.organizations (name, slug, created_by) values (p_name, p_slug, v_uid) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.business_profiles (organization_id) values (v_org);
  return v_org;
end $$;
revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.business_profiles enable row level security;
alter table public.products_services enable row level security;
alter table public.ideal_customer_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;

-- profiles: self, teammates, or super admin; users cannot change is_super_admin
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_super_admin() or exists (
    select 1 from public.organization_members a join public.organization_members b
      on a.organization_id = b.organization_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- organizations (no INSERT/DELETE policy: create via create_organization(), delete via service role)
create policy orgs_select on public.organizations for select to authenticated
  using (private.is_member(id) or private.is_super_admin());
create policy orgs_update on public.organizations for update to authenticated
  using (private.has_role(id, array['owner','admin']::public.org_role[]))
  with check (private.has_role(id, array['owner','admin']::public.org_role[]));
revoke update on public.organizations from authenticated;
grant update (name, logo_url, onboarding_completed) on public.organizations to authenticated;

-- members (owner role can never be granted/changed/removed via the client)
create policy members_select on public.organization_members for select to authenticated
  using (private.is_member(organization_id) or private.is_super_admin());
create policy members_insert on public.organization_members for insert to authenticated
  with check (private.has_role(organization_id, array['owner','admin']::public.org_role[]) and role <> 'owner');
create policy members_update on public.organization_members for update to authenticated
  using (private.has_role(organization_id, array['owner','admin']::public.org_role[]) and role <> 'owner')
  with check (private.has_role(organization_id, array['owner','admin']::public.org_role[]) and role <> 'owner');
create policy members_delete on public.organization_members for delete to authenticated
  using (private.has_role(organization_id, array['owner','admin']::public.org_role[]) and role <> 'owner');

create policy inv_all on public.organization_invitations for all to authenticated
  using (private.has_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (private.has_role(organization_id, array['owner','admin']::public.org_role[]) and invited_by = (select auth.uid()));

-- business config: members read; owner/admin (profile) and +sales_manager (products, ICP) write
create policy bp_select on public.business_profiles for select to authenticated using (private.is_member(organization_id));
create policy bp_update on public.business_profiles for update to authenticated
  using (private.has_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (private.has_role(organization_id, array['owner','admin']::public.org_role[]));

create policy ps_select on public.products_services for select to authenticated using (private.is_member(organization_id));
create policy ps_write on public.products_services for all to authenticated
  using (private.has_role(organization_id, array['owner','admin','sales_manager']::public.org_role[]))
  with check (private.has_role(organization_id, array['owner','admin','sales_manager']::public.org_role[]));

create policy icp_select on public.ideal_customer_profiles for select to authenticated using (private.is_member(organization_id));
create policy icp_write on public.ideal_customer_profiles for all to authenticated
  using (private.has_role(organization_id, array['owner','admin','sales_manager']::public.org_role[]))
  with check (private.has_role(organization_id, array['owner','admin','sales_manager']::public.org_role[]));

-- leads: all members read; analysts are read-only
create policy leads_select on public.leads for select to authenticated
  using (private.is_member(organization_id) or private.is_super_admin());
create policy leads_write on public.leads for all to authenticated
  using (private.has_role(organization_id, array['owner','admin','sales_manager','sales_rep']::public.org_role[]))
  with check (private.has_role(organization_id, array['owner','admin','sales_manager','sales_rep']::public.org_role[]));

-- audit logs: org admins read; writes via service role only
create policy audit_select on public.audit_logs for select to authenticated
  using (private.has_role(organization_id, array['owner','admin']::public.org_role[]) or private.is_super_admin());

-- platform_settings: RLS on, no policies => service role only

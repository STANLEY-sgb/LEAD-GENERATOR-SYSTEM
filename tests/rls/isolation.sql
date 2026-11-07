-- RLS isolation test. Run against a LOCAL/disposable Supabase DB after applying migrations:
--   psql "$DATABASE_URL" -f tests/rls/isolation.sql
-- Raises an exception (non-zero exit with ON_ERROR_STOP) on any isolation failure; rolls back at the end.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.dev');

-- Org A (user A) and Org B (user B) created via the real RPC, as each user.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.create_organization('Org A', 'org-a');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.create_organization('Org B', 'org-b');

do $$
declare a uuid; b uuid; n int;
begin
  -- seed one lead per org as the owning user
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  select id into a from public.organizations where slug = 'org-a';
  insert into public.leads (organization_id, name) values (a, 'A-lead');

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  select id into b from public.organizations where slug = 'org-b';
  insert into public.leads (organization_id, name) values (b, 'B-lead');

  -- 1. B sees only its own org + lead
  select count(*) into n from public.organizations;      assert n = 1, 'B must see exactly 1 org, saw ' || n;
  select count(*) into n from public.leads;              assert n = 1, 'B must see exactly 1 lead, saw ' || n;
  select count(*) into n from public.leads where organization_id = a; assert n = 0, 'B must not read A leads';

  -- 2. B cannot insert into A
  begin
    insert into public.leads (organization_id, name) values (a, 'evil');
    raise exception 'B inserted a lead into org A';
  exception when insufficient_privilege or check_violation then null; end;

  -- 3. B cannot update/delete A leads (silently 0 rows)
  update public.leads set name = 'pwned' where organization_id = a; get diagnostics n = row_count;
  assert n = 0, 'B updated A lead';
  delete from public.leads where organization_id = a; get diagnostics n = row_count;
  assert n = 0, 'B deleted A lead';

  -- 4. B cannot self-join A as admin, nor mint owners
  begin
    insert into public.organization_members (organization_id, user_id, role)
    values (a, '00000000-0000-0000-0000-00000000000b', 'admin');
    raise exception 'B joined org A';
  exception when insufficient_privilege or check_violation then null; end;

  -- 5. nobody can escalate to super admin
  begin
    update public.profiles set is_super_admin = true where id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'privilege escalation to super admin';
  exception when insufficient_privilege then null; end;

  -- 6. a user with no org (C) sees nothing
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
  select count(*) into n from public.leads;          assert n = 0, 'C sees leads';
  select count(*) into n from public.organizations;  assert n = 0, 'C sees orgs';
  raise notice 'RLS isolation: ALL CHECKS PASSED';
end $$;

rollback;

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

/** Minimal emulation of Supabase's auth schema/roles so the REAL migrations run unmodified. */
const STUB = `
create schema auth;
create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text,
  raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid $$;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function createDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec("create extension if not exists pgcrypto;");
  await db.exec(STUB);
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  return db;
}

export const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

export async function addUser(db: PGlite, n: number) {
  await db.query("insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)", [uid(n), `u${n}@t.dev`]);
}

/** Runs fn as an authenticated user (RLS applies). */
export async function asUser<T>(db: PGlite, n: number | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claims', '${n === null ? "{}" : JSON.stringify({ sub: uid(n), role: "authenticated" })}', false); set role ${n === null ? "anon" : "authenticated"};`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
}

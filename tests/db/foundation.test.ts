import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, createDb, uid } from "./harness";

let db: PGlite; let orgA: string; let orgB: string;

beforeAll(async () => {
  db = await createDb();
  for (const n of [1, 2, 3]) await addUser(db, n);
  orgA = await asUser(db, 1, async () => (await db.query<{ create_organization: string }>("select public.create_organization('Org A','org-a')")).rows[0].create_organization);
  orgB = await asUser(db, 2, async () => (await db.query<{ create_organization: string }>("select public.create_organization('Org B','org-b')")).rows[0].create_organization);
  await asUser(db, 1, () => db.query("insert into public.leads (organization_id, name) values ($1,'A-lead')", [orgA]));
  await asUser(db, 2, () => db.query("insert into public.leads (organization_id, name) values ($1,'B-lead')", [orgB]));
}, 60_000);

describe("tenant isolation (RLS)", () => {
  it("user B only sees own org and leads", async () => {
    await asUser(db, 2, async () => {
      expect((await db.query("select * from public.organizations")).rows).toHaveLength(1);
      const leads = await db.query<{ name: string }>("select name from public.leads");
      expect(leads.rows.map((r) => r.name)).toEqual(["B-lead"]);
    });
  });
  it("B cannot insert into, update or delete A's data", async () => {
    await asUser(db, 2, async () => {
      await expect(db.query("insert into public.leads (organization_id, name) values ($1,'evil')", [orgA])).rejects.toThrow();
      expect((await db.query("update public.leads set name='pwn' where organization_id=$1", [orgA])).affectedRows).toBe(0);
      expect((await db.query("delete from public.leads where organization_id=$1", [orgA])).affectedRows).toBe(0);
    });
  });
  it("B cannot self-join A or mint an owner", async () => {
    await asUser(db, 2, async () => {
      await expect(db.query("insert into public.organization_members (organization_id,user_id,role) values ($1,$2,'admin')", [orgA, uid(2)])).rejects.toThrow();
    });
  });
  it("nobody can escalate to super admin", async () => {
    await asUser(db, 2, async () => {
      await expect(db.query("update public.profiles set is_super_admin=true where id=$1", [uid(2)])).rejects.toThrow();
    });
  });
  it("a user with no org sees nothing", async () => {
    await asUser(db, 3, async () => {
      expect((await db.query("select * from public.leads")).rows).toHaveLength(0);
      expect((await db.query("select * from public.organizations")).rows).toHaveLength(0);
    });
  });
  it("anonymous role cannot read tenant data or create orgs", async () => {
    await asUser(db, null, async () => {
      await expect(db.query("select * from public.leads")).rejects.toThrow();
      await expect(db.query("select public.create_organization('x','xx')")).rejects.toThrow();
    });
  });
});

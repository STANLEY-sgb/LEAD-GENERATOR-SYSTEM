import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, createDb, uid } from "./harness";

let db: PGlite; let orgA: string; let orgB: string;
const score = JSON.stringify({ score: 80, qualification: "hot", factors: [], explanation: "x" });
const ingest = async (org: string, lead: object) =>
  (await db.query<{ ingest_lead: { outcome: string; lead_id?: string } }>("select public.ingest_lead($1, $2::jsonb, $3::jsonb)", [org, JSON.stringify(lead), score])).rows[0].ingest_lead;

beforeAll(async () => {
  db = await createDb();
  for (const n of [1, 2, 3]) await addUser(db, n);
  orgA = await asUser(db, 1, async () => (await db.query<{ create_organization: string }>("select public.create_organization('Org A','org-a')")).rows[0].create_organization);
  orgB = await asUser(db, 2, async () => (await db.query<{ create_organization: string }>("select public.create_organization('Org B','org-b')")).rows[0].create_organization);
});

describe("organization seeding", () => {
  it("creates the 9 default pipeline stages, scoring config and starter subscription", async () => {
    expect((await db.query("select * from public.pipeline_stages where organization_id=$1", [orgA])).rows).toHaveLength(9);
    expect((await db.query("select * from public.scoring_configs where organization_id=$1", [orgA])).rows).toHaveLength(1);
    expect((await db.query<{ plan_id: string }>("select plan_id from public.subscriptions where organization_id=$1", [orgA])).rows[0].plan_id).toBe("starter");
  });
});

describe("ingest_lead", () => {
  it("creates a lead with history, score and activity in the first open stage", async () => {
    const r = await ingest(orgA, { name: "Jo", email_n: "jo@x.com", source: "web_form" });
    expect(r.outcome).toBe("created");
    const lead = (await db.query<{ stage: string; score: number }>("select s.name as stage, l.score from public.leads l join public.pipeline_stages s on s.id=l.stage_id where l.id=$1", [r.lead_id])).rows[0];
    expect(lead).toEqual({ stage: "New Lead", score: 80 });
    expect((await db.query("select 1 from public.lead_scores where lead_id=$1", [r.lead_id])).rows).toHaveLength(1);
  });
  it("treats the same normalized email as a duplicate and does not create a second lead", async () => {
    const r = await ingest(orgA, { name: "Jo again", email_n: "jo@x.com", source: "csv_import" });
    expect(r.outcome).toBe("duplicate");
    expect((await db.query("select 1 from public.leads where organization_id=$1 and email_normalized='jo@x.com'", [orgA])).rows).toHaveLength(1);
    expect((await db.query("select 1 from public.lead_sources_history where lead_id=$1", [r.lead_id])).rows).toHaveLength(2);
  });
  it("only flags same-phone leads as candidates; never merges", async () => {
    await ingest(orgA, { name: "P1", email_n: "p1@x.com", phone_n: "+256700000001" });
    const b = await ingest(orgA, { name: "P2", email_n: "p2@y.com", phone_n: "+256700000001" });
    expect(b.outcome).toBe("created");
    expect((await db.query("select reason from public.duplicate_candidates where lead_id=$1", [b.lead_id])).rows[0]).toEqual({ reason: "same phone number" });
  });
  it("is tenant scoped: same email in another org is a separate lead", async () => {
    expect((await ingest(orgB, { name: "Jo", email_n: "jo@x.com" })).outcome).toBe("created");
  });
  it("honours the suppression list", async () => {
    await db.query("insert into public.suppression_list (organization_id, email_normalized) values ($1,'no@x.com')", [orgA]);
    expect((await ingest(orgA, { name: "No", email_n: "no@x.com" })).outcome).toBe("suppressed");
  });
  it("is not callable by authenticated users", async () => {
    await asUser(db, 1, async () => {
      await expect(db.query("select public.ingest_lead($1,'{}'::jsonb,'{}'::jsonb)", [orgA])).rejects.toThrow();
    });
  });
  it("rejects assigning a lead to a stage of another org", async () => {
    const stageB = (await db.query<{ id: string }>("select id from public.pipeline_stages where organization_id=$1 limit 1", [orgB])).rows[0].id;
    await asUser(db, 1, async () => {
      await expect(db.query("update public.leads set stage_id=$1 where organization_id=$2", [stageB, orgA])).rejects.toThrow();
    });
  });
});

describe("rbac + secrets", () => {
  it("analysts can read but not write leads", async () => {
    await addUser(db, 4);
    await db.query("insert into public.organization_members (organization_id,user_id,role) values ($1,$2,'analyst')", [orgA, uid(4)]);
    await asUser(db, 4, async () => {
      expect((await db.query("select 1 from public.leads")).rows.length).toBeGreaterThan(0);
      await expect(db.query("insert into public.leads (organization_id,name) values ($1,'x')", [orgA])).rejects.toThrow();
    });
  });
  it("integration credential ciphertext is unreadable by clients", async () => {
    await db.query("insert into public.integration_credentials (organization_id, provider, ciphertext) values ($1,'x','secret')", [orgA]);
    await asUser(db, 1, async () => {
      await expect(db.query("select ciphertext from public.integration_credentials")).rejects.toThrow();
      expect((await db.query("select provider from public.integration_credentials")).rows).toHaveLength(1);
    });
  });
  it("clients cannot change their own subscription plan or usage", async () => {
    await asUser(db, 1, async () => {
      await expect(db.query("update public.subscriptions set plan_id='enterprise' where organization_id=$1", [orgA])).rejects.toThrow();
    });
  });
  it("job queue is claimable once, cap per org enforced, service-only", async () => {
    for (let i = 0; i < 5; i++) await db.query("insert into public.jobs (organization_id,type) values ($1,'t')", [orgA]);
    const claimed = (await db.query("select * from public.claim_jobs(10,'w1')")).rows;
    expect(claimed).toHaveLength(3);                       // per-org concurrency cap
    expect((await db.query("select * from public.claim_jobs(10,'w2')")).rows).toHaveLength(0); // none double-claimed
    await asUser(db, 1, async () => { await expect(db.query("select * from public.claim_jobs(1,'x')")).rejects.toThrow(); });
  });
  it("invitations: wrong e-mail rejected, right e-mail joins as invited role", async () => {
    await addUser(db, 5);
    const tok = (await db.query<{ token: string }>("insert into public.organization_invitations (organization_id,email,role,invited_by) values ($1,'u5@t.dev','sales_rep',$2) returning token", [orgA, uid(1)])).rows[0].token;
    await asUser(db, 3, async () => { await expect(db.query("select public.accept_invitation($1)", [tok])).rejects.toThrow(/different e-mail/); });
    await asUser(db, 5, async () => { await expect(db.query("select public.accept_invitation($1)", [tok])).rejects.toThrow(/member limit/); }); // Starter = 2 seats
    await db.query("update public.subscriptions set plan_id='growth' where organization_id=$1", [orgA]);
    await asUser(db, 5, async () => { await db.query("select public.accept_invitation($1)", [tok]); });
    expect((await db.query<{ role: string }>("select role from public.organization_members where user_id=$1", [uid(5)])).rows[0].role).toBe("sales_rep");
    await asUser(db, 3, async () => { await expect(db.query("select public.accept_invitation($1)", [tok])).rejects.toThrow(); }); // single use
  });
});

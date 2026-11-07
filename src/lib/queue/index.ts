import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Postgres-backed job queue (jobs table + claim_jobs SKIP LOCKED). Chosen because it needs no extra infrastructure on
 * Supabase and gives transactional enqueue, idempotency keys, priorities, per-org fairness and a dead-letter state.
 * The Job interface is small so a Redis/BullMQ implementation can replace it later.
 */
export type JobHandler = (job: { id: string; organization_id: string | null; payload: Record<string, unknown>; attempts: number }) => Promise<void>;
export const handlers: Record<string, JobHandler> = {};

export async function enqueue(type: string, payload: Record<string, unknown>, opts: { orgId?: string | null; priority?: number; runAt?: Date; idempotencyKey?: string; maxAttempts?: number } = {}) {
  const { error } = await createAdminClient().from("jobs").insert({
    type, payload, organization_id: opts.orgId ?? null, priority: opts.priority ?? 0,
    run_at: (opts.runAt ?? new Date()).toISOString(), idempotency_key: opts.idempotencyKey ?? null, max_attempts: opts.maxAttempts ?? 5,
  });
  if (error && error.code !== "23505") throw error; // 23505 = idempotency key already enqueued: safe no-op
}

const backoffMs = (attempt: number) => Math.min(30_000 * 2 ** attempt, 6 * 3600_000);

export interface TickResult { claimed: number; succeeded: number; failed: number; dead: number; requeued: number }

/** Claims and runs up to `limit` jobs within `budgetMs`. Safe to call concurrently from many workers/instances. */
export async function processJobs(opts: { limit?: number; budgetMs?: number } = {}): Promise<TickResult> {
  await import("./handlers"); // registers handlers
  const admin = createAdminClient();
  const worker = `w-${randomUUID().slice(0, 8)}`;
  const deadline = Date.now() + (opts.budgetMs ?? 45_000);
  const res: TickResult = { claimed: 0, succeeded: 0, failed: 0, dead: 0, requeued: 0 };

  const { data: stale } = await admin.rpc("requeue_stale_jobs");
  res.requeued = Number(stale ?? 0);

  const { data: jobs, error } = await admin.rpc("claim_jobs", { p_limit: opts.limit ?? 10, p_worker: worker });
  if (error) throw error;
  res.claimed = jobs?.length ?? 0;

  await Promise.allSettled((jobs ?? []).map(async (job: { id: string; type: string; organization_id: string | null; payload: Record<string, unknown>; attempts: number; max_attempts: number }) => {
    try {
      if (Date.now() > deadline) throw new Error("tick budget exceeded; will retry");
      const h = handlers[job.type];
      if (!h) throw new Error(`No handler for job type ${job.type}`);
      await h(job);
      await admin.from("jobs").update({ status: "succeeded", finished_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
      res.succeeded++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const dead = job.attempts >= job.max_attempts;
      await admin.from("jobs").update(
        dead ? { status: "dead", finished_at: new Date().toISOString(), last_error: msg }
             : { status: "queued", locked_at: null, locked_by: null, last_error: msg, run_at: new Date(Date.now() + backoffMs(job.attempts)).toISOString() },
      ).eq("id", job.id);
      if (dead) res.dead++; else res.failed++;
    }
  }));
  return res;
}

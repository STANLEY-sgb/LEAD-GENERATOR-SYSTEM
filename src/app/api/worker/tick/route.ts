import { NextResponse } from "next/server";
import { safeEqualStr } from "@/lib/auth-util";
import { enqueue, processJobs } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Worker tick. Invoke from Vercel Cron (sends `Authorization: Bearer $CRON_SECRET`), pg_cron, or any scheduler.
 * Many ticks may run concurrently: jobs are claimed with SKIP LOCKED so none run twice.
 */
async function tick(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !safeEqualStr(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Hourly housekeeping job (idempotent per hour).
  await enqueue("stale.scan", {}, { idempotencyKey: `stale:${new Date().toISOString().slice(0, 13)}` });
  const result = await processJobs({ limit: 15, budgetMs: 50_000 });
  return NextResponse.json(result);
}
export const GET = tick;
export const POST = tick;

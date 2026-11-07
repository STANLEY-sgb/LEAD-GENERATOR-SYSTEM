import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type Metric = "leads_per_month" | "ai_calls_per_month" | "discovery_runs_per_month" | "workflows" | "campaigns" | "members";
export const MONTHLY_METRICS: Metric[] = ["leads_per_month", "ai_calls_per_month", "discovery_runs_per_month"];

export async function getLimits(orgId: string): Promise<{ plan: string; status: string; limits: Record<Metric, number> }> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("subscriptions").select("plan_id, status, limit_overrides, plans(limits)").eq("organization_id", orgId).single();
  if (error || !data) throw new Error("No subscription found for organization");
  const planLimits = (data.plans as unknown as { limits: Record<string, number> }).limits;
  return { plan: data.plan_id, status: data.status, limits: { ...planLimits, ...(data.limit_overrides as object) } as Record<Metric, number> };
}

/**
 * Server-side entitlement gate for monthly metered usage. Increments atomically and rolls back if the new total
 * exceeds the plan limit, so concurrent requests cannot overshoot. Returns false when the limit is reached.
 */
export async function consume(orgId: string, metric: Metric, qty = 1): Promise<boolean> {
  const { limits, status } = await getLimits(orgId);
  if (status === "canceled") return false;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("increment_usage", { p_org: orgId, p_metric: metric, p_qty: qty });
  if (error) throw error;
  if (Number(data) > (limits[metric] ?? 0)) {
    await admin.rpc("increment_usage", { p_org: orgId, p_metric: metric, p_qty: -qty });
    return false;
  }
  return true;
}
export async function refund(orgId: string, metric: Metric, qty = 1) {
  await createAdminClient().rpc("increment_usage", { p_org: orgId, p_metric: metric, p_qty: -qty });
}

/** For count-based limits (workflows, campaigns, members): compares the live row count with the plan. */
export async function withinCountLimit(orgId: string, metric: "workflows" | "campaigns" | "members"): Promise<{ ok: boolean; limit: number; used: number }> {
  const { limits } = await getLimits(orgId);
  const admin = createAdminClient();
  const table = { workflows: "automation_workflows", campaigns: "campaigns", members: "organization_members" }[metric];
  const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  const used = count ?? 0;
  return { ok: used < (limits[metric] ?? 0), limit: limits[metric] ?? 0, used };
}

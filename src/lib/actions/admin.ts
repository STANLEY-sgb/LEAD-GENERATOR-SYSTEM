"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, requireSuperAdmin } from "@/lib/admin";
import { fail, type ActionResult } from "./helpers";

const id = z.string().uuid();
const msg = (e: unknown) => (e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Invalid input") : e);

export async function setOrgStatus(orgId: string, status: "active" | "suspended"): Promise<ActionResult> {
  try {
    const { userId, admin } = await requireSuperAdmin();
    const s = z.enum(["active", "suspended"]).parse(status);
    const { error } = await admin.from("organizations").update({ status: s }).eq("id", id.parse(orgId));
    if (error) throw error;
    await audit(userId, `organization.${s}`, "organizations", orgId, {}, orgId);
    revalidatePath("/admin/organizations");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function setOrgPlan(orgId: string, planId: string): Promise<ActionResult> {
  try {
    const { userId, admin } = await requireSuperAdmin();
    const { error } = await admin.from("subscriptions").update({ plan_id: z.string().max(40).parse(planId), updated_at: new Date().toISOString() }).eq("organization_id", id.parse(orgId));
    if (error) throw error;
    await audit(userId, "subscription.plan_changed", "subscriptions", orgId, { planId }, orgId);
    revalidatePath("/admin/organizations");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function updatePlanLimits(planId: string, limitsJson: string): Promise<ActionResult> {
  try {
    const { userId, admin } = await requireSuperAdmin();
    const limits = z.record(z.string(), z.number().int().min(0)).parse(JSON.parse(limitsJson));
    const { error } = await admin.from("plans").update({ limits }).eq("id", z.string().max(40).parse(planId));
    if (error) throw error;
    await audit(userId, "plan.limits_updated", "plans", planId, { limits });
    revalidatePath("/admin/plans");
    return { ok: true };
  } catch (e) { return fail(e instanceof SyntaxError ? new Error("Limits must be valid JSON, e.g. {\"leads_per_month\": 500}") : msg(e)); }
}

export async function setOrgOverrides(orgId: string, overridesJson: string): Promise<ActionResult> {
  try {
    const { userId, admin } = await requireSuperAdmin();
    const o = z.record(z.string(), z.number().int().min(0)).parse(JSON.parse(overridesJson || "{}"));
    const { error } = await admin.from("subscriptions").update({ limit_overrides: o }).eq("organization_id", id.parse(orgId));
    if (error) throw error;
    await audit(userId, "subscription.overrides_set", "subscriptions", orgId, { o }, orgId);
    revalidatePath("/admin/organizations");
    return { ok: true };
  } catch (e) { return fail(e instanceof SyntaxError ? new Error("Overrides must be valid JSON") : msg(e)); }
}

export async function saveSetting(key: string, valueJson: string): Promise<ActionResult> {
  try {
    const { userId, admin } = await requireSuperAdmin();
    const k = z.string().trim().min(1).max(80).regex(/^[a-z0-9_.-]+$/i).parse(key);
    const value = JSON.parse(valueJson);
    const { error } = await admin.from("platform_settings").upsert({ key: k, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    await audit(userId, "setting.updated", "platform_settings", k);
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (e) { return fail(e instanceof SyntaxError ? new Error("Value must be valid JSON") : msg(e)); }
}

export async function retryDeadJob(jobId: string): Promise<ActionResult> {
  try {
    const { userId, admin } = await requireSuperAdmin();
    const { error } = await admin.from("jobs").update({ status: "queued", attempts: 0, run_at: new Date().toISOString(), last_error: null, locked_at: null, locked_by: null, finished_at: null }).eq("id", id.parse(jobId)).eq("status", "dead");
    if (error) throw error;
    await audit(userId, "job.retried", "jobs", jobId);
    revalidatePath("/admin/system");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

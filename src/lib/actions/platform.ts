"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { withinCountLimit, consume } from "@/lib/billing/entitlements";
import { getConnector } from "@/lib/connectors";
import { encrypt, encryptionConfigured } from "@/lib/crypto";
import { enqueue, processJobs } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, MANAGER_ROLES, fail, list, requireRole, type ActionResult } from "./helpers";
import { getOrgContext } from "@/lib/org-context";

const id = z.string().uuid();
const msg = (e: unknown) => (e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Invalid input") : e);

// ---------- discovery ----------
const discoverySchema = z.object({ connector: z.string().max(40), keywords: z.string().trim().min(2, "Enter at least one keyword"), location: z.string().max(120).default(""), limit: z.number().int().min(1).max(20), campaignId: id.nullable().optional() });
export async function startDiscovery(input: z.input<typeof discoverySchema>): Promise<ActionResult> {
  try {
    const v = discoverySchema.parse(input);
    const { supabase, orgId, userId } = await requireRole(MANAGER_ROLES);
    const c = getConnector(v.connector);
    if (!c?.search) throw new Error("This source does not support discovery");
    if (!c.configured()) throw new Error(`${c.name} is not configured on this deployment (${c.requiredEnv.join(", ")}).`);
    if (!(await consume(orgId, "discovery_runs_per_month"))) throw new Error("Monthly discovery limit reached for your plan");
    const { data: run, error } = await supabase.from("discovery_runs").insert({ organization_id: orgId, connector: v.connector, created_by: userId, query: { keywords: list(v.keywords, 10), location: v.location, limit: v.limit, campaignId: v.campaignId ?? undefined } }).select("id").single();
    if (error) throw error;
    await supabase.from("lead_sources").upsert({ organization_id: orgId, connector: v.connector, enabled: true }, { onConflict: "organization_id,connector" });
    await enqueue("discovery.run", { runId: run.id }, { orgId, idempotencyKey: `disc:${run.id}`, priority: 1 });
    after(() => processJobs({ limit: 3, budgetMs: 40_000 }).catch(() => undefined));
    revalidatePath("/discovery");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

// ---------- campaigns ----------
const campaignSchema = z.object({
  id: id.optional(), name: z.string().trim().min(2, "Name required").max(120), description: z.string().max(1000).default(""), targetAudience: z.string().max(500).default(""),
  markets: z.string().default(""), keywords: z.string().default(""), sources: z.string().default(""), minScore: z.number().int().min(0).max(100).default(0),
  startsAt: z.string().default(""), endsAt: z.string().default(""), dailyLimit: z.number().int().min(1).max(10000).default(50), spend: z.string().default(""),
});
export async function saveCampaign(input: z.input<typeof campaignSchema>): Promise<ActionResult> {
  try {
    const v = campaignSchema.parse(input);
    const { supabase, orgId, userId } = await requireRole(MANAGER_ROLES);
    if (v.startsAt && v.endsAt && v.endsAt < v.startsAt) throw new Error("End date must be after the start date");
    const spend = v.spend ? Number(v.spend) : null;
    if (spend !== null && (!Number.isFinite(spend) || spend < 0)) throw new Error("Spend must be a positive number");
    const row = { name: v.name, description: v.description || null, target_audience: v.targetAudience || null, markets: list(v.markets), keywords: list(v.keywords), sources: list(v.sources), min_score: v.minScore, starts_at: v.startsAt || null, ends_at: v.endsAt || null, daily_limit: v.dailyLimit, spend };
    if (v.id) {
      const { error } = await supabase.from("campaigns").update(row).eq("id", v.id).eq("organization_id", orgId);
      if (error) throw error;
    } else {
      const lim = await withinCountLimit(orgId, "campaigns");
      if (!lim.ok) throw new Error(`Your plan allows ${lim.limit} campaign(s). Upgrade to create more.`);
      const { error } = await supabase.from("campaigns").insert({ ...row, organization_id: orgId, created_by: userId });
      if (error) throw error;
    }
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}
export async function setCampaignStatus(campaignId: string, status: "active" | "paused" | "stopped"): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { error } = await supabase.from("campaigns").update({ status: z.enum(["active", "paused", "stopped"]).parse(status) }).eq("id", id.parse(campaignId)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

// ---------- inbound webhook secret ----------
/** Generates (or rotates) the HMAC signing secret. Shown once; stored AES-256-GCM encrypted. */
export async function rotateWebhookSecret(): Promise<ActionResult<{ secret: string; url: string }>> {
  try {
    const { orgId } = await requireRole(ADMIN_ROLES);
    if (!encryptionConfigured()) throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured on this deployment.");
    const secret = randomBytes(32).toString("hex");
    const { error } = await createAdminClient().from("integration_credentials").upsert({ organization_id: orgId, provider: "inbound_webhook", ciphertext: encrypt(secret), status: "connected" }, { onConflict: "organization_id,provider" });
    if (error) throw error;
    revalidatePath("/integrations");
    return { ok: true, data: { secret, url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/public/webhook/${orgId}` } };
  } catch (e) { return fail(msg(e)); }
}
export async function revokeWebhook(): Promise<ActionResult> {
  try {
    const { orgId } = await requireRole(ADMIN_ROLES);
    await createAdminClient().from("integration_credentials").update({ status: "revoked" }).eq("organization_id", orgId).eq("provider", "inbound_webhook");
    revalidatePath("/integrations");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

// ---------- notifications ----------
export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireRole(["owner", "admin", "sales_manager", "sales_rep", "analyst"]);
    let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (ids?.length) q = q.in("id", z.array(id).parse(ids));
    const { error } = await q;
    if (error) throw error;
    revalidatePath("/notifications");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}
export async function savePreferences(p: { in_app: boolean; email: boolean; sms: boolean; high_priority_leads: boolean; automation_failures: boolean }): Promise<ActionResult> {
  try {
    const { supabase, userId, orgId } = await requireRole(["owner", "admin", "sales_manager", "sales_rep", "analyst"]);
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: userId, organization_id: orgId, ...z.object({ in_app: z.boolean(), email: z.boolean(), sms: z.boolean(), high_priority_leads: z.boolean(), automation_failures: z.boolean() }).parse(p) });
    if (error) throw error;
    revalidatePath("/notifications");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

// ---------- organization lifecycle ----------
export async function deleteOrganization(confirmName: string): Promise<ActionResult> {
  try {
    const { orgId, role } = await requireRole(["owner"]);
    const { org } = await getOrgContext();
    if (role !== "owner" || confirmName.trim() !== org?.name) throw new Error("Type the organization name exactly to confirm");
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({ organization_id: null, actor_id: null, action: "organization.deleted", entity: "organizations", entity_id: orgId, metadata: { name: org.name } });
    const { error } = await admin.from("organizations").delete().eq("id", orgId); // cascades to all tenant data
    if (error) throw error;
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

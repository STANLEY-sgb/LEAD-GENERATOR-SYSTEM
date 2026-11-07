"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withinCountLimit } from "@/lib/billing/entitlements";
import { emailConfigured, sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, MANAGER_ROLES, fail, requireRole, type ActionResult } from "./helpers";
import type { OrgRole } from "@/lib/org-context";

const SALES: OrgRole[] = ["owner", "admin", "sales_manager", "sales_rep"];
const id = z.string().uuid();
const msg = (e: unknown) => (e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Invalid input") : e);

// ---------- pipeline ----------
export async function addStage(name: string): Promise<ActionResult> {
  try {
    const n = z.string().trim().min(1, "Name required").max(60).parse(name);
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { data: stages } = await supabase.from("pipeline_stages").select("id, position, kind").eq("organization_id", orgId).order("position");
    // Insert before the terminal Converted/Lost stages so they stay last.
    const firstTerminal = (stages ?? []).find((s) => s.kind !== "open");
    const pos = firstTerminal?.position ?? (stages?.length ?? 0) + 1;
    for (const s of (stages ?? []).filter((s) => s.position >= pos).reverse()) await supabase.from("pipeline_stages").update({ position: s.position + 1 }).eq("id", s.id);
    const { error } = await supabase.from("pipeline_stages").insert({ organization_id: orgId, name: n, position: pos, kind: "open" });
    if (error) throw error;
    revalidatePath("/pipeline");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}
export async function renameStage(stageId: string, name: string): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { error } = await supabase.from("pipeline_stages").update({ name: z.string().trim().min(1).max(60).parse(name) }).eq("id", id.parse(stageId)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/pipeline");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}
export async function deleteStage(stageId: string): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { data: st } = await supabase.from("pipeline_stages").select("kind").eq("id", id.parse(stageId)).eq("organization_id", orgId).single();
    if (st?.kind !== "open") throw new Error("The Converted and Lost stages cannot be deleted");
    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("stage_id", stageId).is("deleted_at", null);
    if (count) throw new Error(`Move the ${count} lead(s) in this stage elsewhere first`);
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/pipeline");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

// ---------- tasks ----------
const taskSchema = z.object({
  title: z.string().trim().min(1, "Title required").max(200), type: z.enum(["call", "email", "meeting", "follow_up", "review"]),
  dueAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Pick a valid date/time"), leadId: id.nullable().optional(), assignedTo: id.nullable().optional(),
});
export async function createTask(input: z.input<typeof taskSchema>): Promise<ActionResult> {
  try {
    const v = taskSchema.parse(input);
    const { supabase, orgId, userId } = await requireRole(SALES);
    const { error } = await supabase.from("follow_up_tasks").insert({ organization_id: orgId, lead_id: v.leadId ?? null, assigned_to: v.assignedTo ?? userId, type: v.type, title: v.title, due_at: new Date(v.dueAt).toISOString(), created_by: userId });
    if (error) throw error;
    revalidatePath("/tasks");
    if (v.leadId) revalidatePath(`/leads/${v.leadId}`);
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}
export async function setTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(SALES);
    const { error } = await supabase.from("follow_up_tasks").update({ completed_at: done ? new Date().toISOString() : null }).eq("id", id.parse(taskId)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/tasks");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

// ---------- team ----------
const ROLES = z.enum(["admin", "sales_manager", "sales_rep", "analyst"]);
export async function inviteMember(email: string, role: string): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  try {
    const e = z.string().trim().toLowerCase().email("Enter a valid e-mail").parse(email);
    const r = ROLES.parse(role);
    const { supabase, orgId, userId, role: myRole } = await requireRole(ADMIN_ROLES);
    if (r === "admin" && myRole !== "owner") throw new Error("Only the owner can invite administrators");
    const seats = await withinCountLimit(orgId, "members");
    if (!seats.ok) throw new Error(`Your plan allows ${seats.limit} members. Upgrade to invite more.`);
    const { data, error } = await supabase.from("organization_invitations").insert({ organization_id: orgId, email: e, role: r, invited_by: userId }).select("token").single();
    if (error) throw error;
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${data.token}`;
    let emailed = false;
    if (emailConfigured()) {
      try { await sendEmail({ to: e, subject: "You've been invited to join a team on LeadPilot", text: `Accept your invitation: ${link}\n\nThis link expires in 7 days.` }); emailed = true; } catch { /* link is still shown to the inviter */ }
    }
    revalidatePath("/team");
    return { ok: true, data: { link, emailed } };
  } catch (e) { return fail(msg(e)); }
}
export async function revokeInvitation(invId: string): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(ADMIN_ROLES);
    const { error } = await supabase.from("organization_invitations").delete().eq("id", id.parse(invId)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/team");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}
export async function changeMemberRole(memberId: string, role: string): Promise<ActionResult> {
  try {
    const r = ROLES.parse(role);
    const { supabase, orgId, role: myRole } = await requireRole(ADMIN_ROLES);
    if (r === "admin" && myRole !== "owner") throw new Error("Only the owner can grant administrator access");
    const { data, error } = await supabase.from("organization_members").update({ role: r }).eq("id", id.parse(memberId)).eq("organization_id", orgId).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Member not found or cannot be changed");
    revalidatePath("/team");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}
export async function removeMember(memberId: string): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(ADMIN_ROLES);
    const { data, error } = await supabase.from("organization_members").delete().eq("id", id.parse(memberId)).eq("organization_id", orgId).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Member not found or cannot be removed");
    revalidatePath("/team");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

// ---------- lead capture forms ----------
const formSchema = z.object({ name: z.string().trim().min(2, "Name required").max(120), heading: z.string().max(160).default(""), consentText: z.string().trim().min(10, "Consent wording is required").max(500), collectPhone: z.boolean(), collectCompany: z.boolean() });
export async function createForm(input: z.input<typeof formSchema>): Promise<ActionResult> {
  try {
    const v = formSchema.parse(input);
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { error } = await supabase.from("lead_forms").insert({ organization_id: orgId, name: v.name, heading: v.heading || null, consent_text: v.consentText, collect_phone: v.collectPhone, collect_company: v.collectCompany });
    if (error) throw error;
    revalidatePath("/capture");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}
export async function setFormActive(formId: string, active: boolean): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { error } = await supabase.from("lead_forms").update({ active }).eq("id", id.parse(formId)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/capture");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

// ---------- scoring configuration ----------
const weights = z.object({ relevance: z.number().min(0).max(100), geography: z.number().min(0).max(100), industry: z.number().min(0).max(100), profile: z.number().min(0).max(100), intent: z.number().min(0).max(100), completeness: z.number().min(0).max(100), recency: z.number().min(0).max(100), source: z.number().min(0).max(100) });
export async function saveScoringConfig(input: { weights: z.input<typeof weights>; hot: number; warm: number; cold: number }): Promise<ActionResult> {
  try {
    const w = weights.parse(input.weights);
    if (Object.values(w).every((x) => x === 0)) throw new Error("At least one weight must be above zero");
    const { hot, warm, cold } = z.object({ hot: z.number().int().min(1).max(100), warm: z.number().int().min(1).max(100), cold: z.number().int().min(0).max(100) }).parse(input);
    if (!(hot > warm && warm > cold)) throw new Error("Thresholds must satisfy hot > warm > cold");
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { error } = await supabase.from("scoring_configs").update({ weights: w, hot_threshold: hot, warm_threshold: warm, cold_threshold: cold, updated_at: new Date().toISOString() }).eq("organization_id", orgId);
    if (error) throw error;
    await createAdminClient().from("audit_logs").insert({ organization_id: orgId, action: "scoring.updated", entity: "scoring_configs" });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

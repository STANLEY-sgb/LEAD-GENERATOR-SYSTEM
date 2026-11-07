"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionSchema, MAX_ACTIONS, retryExecution } from "@/lib/automation/engine";
import { withinCountLimit } from "@/lib/billing/entitlements";
import { processJobs } from "@/lib/queue";
import { MANAGER_ROLES, fail, requireRole, type ActionResult } from "./helpers";

const id = z.string().uuid();
const msg = (e: unknown) => (e instanceof z.ZodError ? new Error(`${e.issues[0]?.path.join(".") || "input"}: ${e.issues[0]?.message}`) : e);

const conditionSchema = z.object({
  field: z.enum(["score", "qualification", "country", "industry", "source", "status", "stage", "consent_status", "has_email", "has_phone", "contacted", "tag"]),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "is_true", "is_false"]),
  value: z.union([z.string().max(100), z.number()]).optional(),
});
const wfSchema = z.object({
  id: id.optional(), name: z.string().trim().min(2, "Name required").max(120), description: z.string().max(500).default(""),
  triggerType: z.enum(["lead.created", "lead.captured", "lead.scored", "lead.stage_changed", "lead.stale"]),
  staleDays: z.number().int().min(1).max(90).optional(),
  conditions: z.array(conditionSchema).max(10), actions: z.array(ActionSchema).min(1, "Add at least one action").max(MAX_ACTIONS),
});

export async function saveWorkflow(input: z.input<typeof wfSchema>): Promise<ActionResult> {
  try {
    const v = wfSchema.parse(input);
    const { supabase, orgId, userId } = await requireRole(MANAGER_ROLES);
    const row = { name: v.name, description: v.description || null, trigger_type: v.triggerType, trigger_config: v.staleDays ? { days: v.staleDays } : {}, conditions: v.conditions, actions: v.actions };
    if (v.id) {
      const { error } = await supabase.from("automation_workflows").update(row).eq("id", v.id).eq("organization_id", orgId);
      if (error) throw error;
    } else {
      const lim = await withinCountLimit(orgId, "workflows");
      if (!lim.ok) throw new Error(`Your plan allows ${lim.limit} workflow(s). Upgrade to create more.`);
      const { error } = await supabase.from("automation_workflows").insert({ ...row, organization_id: orgId, created_by: userId, active: false });
      if (error) throw error;
    }
    revalidatePath("/automation");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function setWorkflowActive(wfId: string, active: boolean): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { error } = await supabase.from("automation_workflows").update({ active }).eq("id", id.parse(wfId)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/automation");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function deleteWorkflow(wfId: string): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { error } = await supabase.from("automation_workflows").delete().eq("id", id.parse(wfId)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/automation");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function retryFailedExecution(executionId: string): Promise<ActionResult> {
  try {
    const { orgId } = await requireRole(MANAGER_ROLES);
    await retryExecution(orgId, id.parse(executionId));
    after(() => processJobs({ limit: 5, budgetMs: 20_000 }).catch(() => undefined));
    revalidatePath("/automation");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

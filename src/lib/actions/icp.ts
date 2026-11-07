"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiUnavailableError, getAiProvider, parseJsonLoose } from "@/lib/ai";
import { MANAGER_ROLES, fail, requireRole, type ActionResult } from "./helpers";

const arr = z.array(z.string().trim().min(1).max(200)).max(25).default([]);
const icpShape = z.object({
  segments: arr, industries: arr, buyer_roles: arr, regions: arr, pain_points: arr, keywords: arr, intent_signals: arr,
});
export type IcpDraft = z.infer<typeof icpShape>;

const SYSTEM = `You are a B2B go-to-market strategist. Given a business description, propose an Ideal Customer Profile.
Return ONLY JSON with string-array keys: segments, industries, buyer_roles, regions, pain_points, keywords, intent_signals.
Be specific and realistic. These are hypotheses for the user to review, not facts. Do not invent named people or companies.`;

/** Generates a DRAFT ICP. Nothing is saved or activated: the user must review and approve it. */
export async function generateIcp(description: string): Promise<ActionResult<IcpDraft>> {
  try {
    const text = z.string().trim().min(20, "Describe your product in at least a couple of sentences").max(4000).parse(description);
    await requireRole(MANAGER_ROLES);
    const raw = await getAiProvider().complete({ system: SYSTEM, prompt: text, json: true });
    return { ok: true, data: icpShape.parse(parseJsonLoose(raw)) };
  } catch (e) {
    if (e instanceof AiUnavailableError) return { ok: false, error: "AI is not configured yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to enable suggestions; you can still fill the profile in manually." };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "The AI returned an unexpected format. Try again." };
    return fail(e);
  }
}

const saveSchema = icpShape.extend({ id: z.string().uuid().optional(), name: z.string().trim().min(2).max(120) });

/** Saves as draft. Targeting only becomes active through approveIcp (human approval step). */
export async function saveIcp(input: z.input<typeof saveSchema>): Promise<ActionResult> {
  try {
    const v = saveSchema.parse(input);
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const row = { name: v.name, segments: v.segments, industries: v.industries, buyer_roles: v.buyer_roles, regions: v.regions,
      pain_points: v.pain_points, keywords: v.keywords, intent_signals: v.intent_signals, status: "draft" as const, approved_by: null, approved_at: null };
    const { error } = v.id
      ? await supabase.from("ideal_customer_profiles").update(row).eq("id", v.id).eq("organization_id", orgId)
      : await supabase.from("ideal_customer_profiles").insert({ ...row, organization_id: orgId });
    if (error) throw error;
    revalidatePath("/icp");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function approveIcp(id: string): Promise<ActionResult> {
  try {
    const { supabase, orgId, userId } = await requireRole(MANAGER_ROLES);
    const { error } = await supabase.from("ideal_customer_profiles")
      .update({ status: "active", approved_by: userId, approved_at: new Date().toISOString() })
      .eq("id", z.string().uuid().parse(id)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/icp");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteIcp(id: string): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { error } = await supabase.from("ideal_customer_profiles").delete().eq("id", z.string().uuid().parse(id)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/icp");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

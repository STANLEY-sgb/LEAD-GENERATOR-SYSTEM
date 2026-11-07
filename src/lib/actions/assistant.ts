"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiUnavailableError, getAiProvider } from "@/lib/ai";
import { consume } from "@/lib/billing/entitlements";
import { fail, requireRole, type ActionResult } from "./helpers";

const SYSTEM = `You are the AI sales assistant inside a lead-generation platform. You help ONE organization with its own data.
Rules:
- Use ONLY the workspace data provided. If something is not in the data, say you do not have it. Never invent leads, contacts, numbers or sources.
- Distinguish facts from the data vs. your suggestions. Scores are heuristic, not guarantees.
- You cannot send e-mails, SMS or contact anyone. When asked to write outreach, produce a DRAFT clearly labelled "DRAFT - requires human review before sending". Do not draft messages for contacts whose consent is not "granted" without warning that consent is missing.
- Be concise and practical. Use short lists.`;

/** Business-aware assistant. All data is read through the caller's RLS-scoped session, so it can never see another organization. */
export async function askAssistant(message: string): Promise<ActionResult<{ reply: string }>> {
  try {
    const text = z.string().trim().min(2, "Ask a question").max(2000).parse(message);
    const { supabase, orgId, userId } = await requireRole(["owner", "admin", "sales_manager", "sales_rep", "analyst"]);
    const provider = getAiProvider();
    if (!(await consume(orgId, "ai_calls_per_month"))) return { ok: false, error: "Monthly AI usage limit reached for your plan." };

    const [org, bp, prods, icps, top, recent, stages, history] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", orgId).single(),
      supabase.from("business_profiles").select("description, industry, target_countries").eq("organization_id", orgId).maybeSingle(),
      supabase.from("products_services").select("name, description, keywords").eq("organization_id", orgId).is("deleted_at", null).limit(10),
      supabase.from("ideal_customer_profiles").select("name, segments, industries, regions, status").eq("organization_id", orgId).limit(5),
      supabase.from("leads").select("id, name, company, country, industry, source, score, qualification, status, consent_status").eq("organization_id", orgId).is("deleted_at", null).order("score", { ascending: false, nullsFirst: false }).limit(10),
      supabase.from("leads").select("name, company, source, score, qualification, created_at").eq("organization_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
      supabase.from("leads").select("status").eq("organization_id", orgId).is("deleted_at", null).limit(5000),
      supabase.from("ai_messages").select("role, content").eq("organization_id", orgId).eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    ]);
    const statusCounts: Record<string, number> = {};
    for (const r of stages.data ?? []) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

    const context = JSON.stringify({ organization: org.data?.name, business: bp.data, products: prods.data, ideal_customer_profiles: icps.data, top_scored_leads: top.data, newest_leads: recent.data, lead_counts_by_status: statusCounts, today: new Date().toISOString().slice(0, 10) });
    const convo = (history.data ?? []).reverse().map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
    const reply = (await provider.complete({ system: SYSTEM, prompt: `WORKSPACE DATA (JSON):\n${context}\n\nRECENT CONVERSATION:\n${convo}\n\nUSER: ${text}`, maxTokens: 900 })).trim();

    await supabase.from("ai_messages").insert([{ organization_id: orgId, user_id: userId, role: "user", content: text }, { organization_id: orgId, user_id: userId, role: "assistant", content: reply }]);
    revalidatePath("/assistant");
    return { ok: true, data: { reply } };
  } catch (e) {
    if (e instanceof AiUnavailableError) return { ok: false, error: "The AI assistant isn't configured yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY." };
    return fail(e instanceof z.ZodError ? new Error(e.issues[0]?.message) : e);
  }
}

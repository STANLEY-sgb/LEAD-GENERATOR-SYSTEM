import "server-only";
import { z } from "zod";
import { getAiProvider, parseJsonLoose } from "@/lib/ai";
import { consume } from "@/lib/billing/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";

const summarySchema = z.object({
  overview: z.string(), relevant_offering: z.string(), match_reason: z.string(),
  likely_needs: z.array(z.string()).default([]), suggested_approach: z.string(), next_action: z.string(),
});

/** Generates an AI-assisted lead brief. Output is stored as clearly-labelled AI content, never as verified fact. */
export async function generateLeadSummary(orgId: string, leadId: string) {
  const admin = createAdminClient();
  const [{ data: lead }, { data: bp }, { data: prods }, { data: score }] = await Promise.all([
    admin.from("leads").select("name, company, country, industry, source, score, qualification, website").eq("id", leadId).eq("organization_id", orgId).single(),
    admin.from("business_profiles").select("description, industry").eq("organization_id", orgId).maybeSingle(),
    admin.from("products_services").select("name, description").eq("organization_id", orgId).is("deleted_at", null).limit(10),
    admin.from("lead_scores").select("explanation, factors").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!lead) throw new Error("Lead not found");
  if (!(await consume(orgId, "ai_calls_per_month"))) throw new Error("Monthly AI usage limit reached for your plan");

  const raw = await getAiProvider().complete({
    json: true, maxTokens: 700,
    system: "You write concise sales briefs. Use ONLY the data given. Do not invent facts, names, contact details or statistics. If something is unknown, say it is unknown. Return JSON with keys: overview, relevant_offering, match_reason, likely_needs (string array), suggested_approach, next_action.",
    prompt: JSON.stringify({ our_business: bp, our_offerings: prods, lead, scoring: score }),
  });
  const summary = summarySchema.parse(parseJsonLoose(raw));
  const stored = { ...summary, generated_at: new Date().toISOString(), ai_generated: true };
  await admin.from("leads").update({ ai_summary: stored }).eq("id", leadId).eq("organization_id", orgId);
  await admin.from("lead_activities").insert({ organization_id: orgId, lead_id: leadId, type: "ai_summary", body: "AI summary generated" });
  return stored;
}

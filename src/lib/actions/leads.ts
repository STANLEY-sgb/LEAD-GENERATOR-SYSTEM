"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateLeadSummary } from "@/lib/ai/summary";
import { AiUnavailableError } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events";
import { ingestLead, loadScoringSetup, type LeadInput } from "@/lib/leads/ingest";
import { parseCsv } from "@/lib/leads/csv";
import { cleanText, normalizeDomain, normalizeEmail, normalizePhone } from "@/lib/leads/normalize";
import { scoreLead } from "@/lib/leads/scoring";
import { statusForStage } from "@/lib/leads/status";
import { processJobs } from "@/lib/queue";
import { MANAGER_ROLES, fail, requireRole, type ActionResult } from "./helpers";
import type { OrgRole } from "@/lib/org-context";

const SALES: OrgRole[] = ["owner", "admin", "sales_manager", "sales_rep"];
const id = z.string().uuid();
const kick = () => after(() => processJobs({ limit: 5, budgetMs: 20_000 }).catch(() => undefined));
const msg = (e: unknown) => (e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Invalid input") : e);

const newLead = z.object({
  name: z.string().trim().min(1, "Name is required").max(160), company: z.string().max(160).default(""), email: z.string().max(200).default(""),
  phone: z.string().max(40).default(""), website: z.string().max(300).default(""), country: z.string().max(80).default(""), industry: z.string().max(120).default(""),
  consentGranted: z.boolean().default(false), consentNote: z.string().max(300).default(""),
});

export async function createLead(input: z.input<typeof newLead>): Promise<ActionResult<{ leadId?: string; duplicate?: boolean }>> {
  try {
    const v = newLead.parse(input);
    const { orgId, userId } = await requireRole(SALES);
    const r = await ingestLead(orgId, {
      ...v, source: "manual", attribution: "Added manually",
      consent: v.consentGranted ? { status: "granted", legalBasis: "consent (recorded by user)", evidence: { note: v.consentNote || null, recorded_by: userId, at: new Date().toISOString() } } : { status: "unknown" },
    });
    if (r.outcome === "limit_reached") return { ok: false, error: "Your plan's monthly lead limit has been reached. Upgrade to add more." };
    if (r.outcome === "suppressed") return { ok: false, error: "This contact is on your suppression list." };
    if (r.outcome === "invalid" || r.outcome === "rejected") return { ok: false, error: r.reason ?? "Could not add lead" };
    kick(); revalidatePath("/leads");
    return { ok: true, data: { leadId: r.leadId, duplicate: r.outcome === "duplicate" } };
  } catch (e) { return fail(msg(e)); }
}

const editSchema = z.object({ id, name: z.string().trim().min(1).max(160), company: z.string().max(160), phone: z.string().max(40), website: z.string().max(300), country: z.string().max(80), industry: z.string().max(120), estValue: z.string().max(20) });
export async function updateLead(input: z.input<typeof editSchema>): Promise<ActionResult> {
  try {
    const v = editSchema.parse(input);
    const { supabase, orgId, userId } = await requireRole(SALES);
    const est = v.estValue ? Number(v.estValue) : null;
    if (est !== null && (!Number.isFinite(est) || est < 0)) throw new Error("Estimated value must be a positive number");
    const { error } = await supabase.from("leads").update({
      name: v.name, company: cleanText(v.company), phone: cleanText(v.phone, 40), phone_normalized: normalizePhone(v.phone), website: cleanText(v.website),
      domain_normalized: normalizeDomain(v.website), country: cleanText(v.country, 80), industry: cleanText(v.industry, 120), est_value: est,
    }).eq("id", v.id).eq("organization_id", orgId);
    if (error) throw error;
    await supabase.from("lead_activities").insert({ organization_id: orgId, lead_id: v.id, actor_id: userId, type: "edited", body: "Lead details edited" });
    revalidatePath(`/leads/${v.id}`);
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function changeStage(leadId: string, stageId: string, lostReason?: string): Promise<ActionResult> {
  try {
    id.parse(leadId); id.parse(stageId);
    const { supabase, orgId, userId } = await requireRole(SALES);
    const { data: st } = await supabase.from("pipeline_stages").select("id, name, kind, position").eq("id", stageId).eq("organization_id", orgId).single();
    if (!st) throw new Error("Stage not found");
    if (st.kind === "lost" && !lostReason?.trim()) throw new Error("Please provide a reason for losing this lead");
    const { error } = await supabase.from("leads").update({
      stage_id: st.id, status: statusForStage(st.kind, st.position),
      converted_at: st.kind === "won" ? new Date().toISOString() : null, lost_reason: st.kind === "lost" ? cleanText(lostReason, 300) : null,
    }).eq("id", leadId).eq("organization_id", orgId);
    if (error) throw error;
    await supabase.from("lead_activities").insert({ organization_id: orgId, lead_id: leadId, actor_id: userId, type: "stage_changed", body: `Moved to ${st.name}` });
    await emitEvent(orgId, "lead.stage_changed", leadId, { eventId: `stage:${leadId}:${st.id}:${Date.now()}` });
    kick(); revalidatePath("/pipeline"); revalidatePath(`/leads/${leadId}`);
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function assignLead(leadId: string, userId: string | null): Promise<ActionResult> {
  try {
    id.parse(leadId); if (userId) id.parse(userId);
    const { supabase, orgId, userId: actor } = await requireRole(SALES);
    const { error } = await supabase.from("leads").update({ assigned_to: userId }).eq("id", leadId).eq("organization_id", orgId); // DB trigger enforces same-org assignee
    if (error) throw error;
    await supabase.from("lead_activities").insert({ organization_id: orgId, lead_id: leadId, actor_id: actor, type: "assigned", body: userId ? "Lead assigned" : "Lead unassigned" });
    revalidatePath(`/leads/${leadId}`);
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function addNote(leadId: string, body: string): Promise<ActionResult> {
  try {
    const text = z.string().trim().min(1, "Note cannot be empty").max(5000).parse(body); id.parse(leadId);
    const { supabase, orgId, userId } = await requireRole(SALES);
    const { error } = await supabase.from("lead_notes").insert({ organization_id: orgId, lead_id: leadId, author_id: userId, body: text });
    if (error) throw error;
    await supabase.from("lead_activities").insert({ organization_id: orgId, lead_id: leadId, actor_id: userId, type: "note", body: text.slice(0, 200) });
    revalidatePath(`/leads/${leadId}`);
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function logCommunication(leadId: string, kind: "call" | "email_sent" | "meeting" | "contacted", summary: string): Promise<ActionResult> {
  try {
    id.parse(leadId);
    const text = z.string().trim().min(1, "Describe the interaction").max(2000).parse(summary);
    const { supabase, orgId, userId } = await requireRole(SALES);
    const { error } = await supabase.from("lead_activities").insert({ organization_id: orgId, lead_id: leadId, actor_id: userId, type: z.enum(["call", "email_sent", "meeting", "contacted"]).parse(kind), body: text });
    if (error) throw error;
    revalidatePath(`/leads/${leadId}`);
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function setTag(leadId: string, tag: string, on: boolean): Promise<ActionResult> {
  try {
    id.parse(leadId); const t = z.string().trim().min(1).max(40).parse(tag);
    const { supabase, orgId } = await requireRole(SALES);
    const { error } = on
      ? await supabase.from("lead_tags").upsert({ organization_id: orgId, lead_id: leadId, tag: t }, { onConflict: "lead_id,tag", ignoreDuplicates: true })
      : await supabase.from("lead_tags").delete().eq("lead_id", leadId).eq("tag", t).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath(`/leads/${leadId}`);
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function archiveLeads(ids: string[]): Promise<ActionResult> {
  try {
    const list = z.array(id).min(1).max(500).parse(ids);
    const { supabase, orgId, userId } = await requireRole(SALES);
    const { error } = await supabase.from("leads").update({ deleted_at: new Date().toISOString(), status: "archived" }).in("id", list).eq("organization_id", orgId);
    if (error) throw error;
    await createAdminClient().from("audit_logs").insert({ organization_id: orgId, actor_id: userId, action: "leads.archived", entity: "leads", metadata: { count: list.length } });
    revalidatePath("/leads");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function bulkAssign(ids: string[], userId: string | null): Promise<ActionResult> {
  try {
    const list = z.array(id).min(1).max(500).parse(ids); if (userId) id.parse(userId);
    const { supabase, orgId } = await requireRole(SALES);
    const { error } = await supabase.from("leads").update({ assigned_to: userId }).in("id", list).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/leads");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function bulkTag(ids: string[], tag: string): Promise<ActionResult> {
  try {
    const list = z.array(id).min(1).max(500).parse(ids); const t = z.string().trim().min(1).max(40).parse(tag);
    const { supabase, orgId } = await requireRole(SALES);
    const { error } = await supabase.from("lead_tags").upsert(list.map((lead_id) => ({ organization_id: orgId, lead_id, tag: t })), { onConflict: "lead_id,tag", ignoreDuplicates: true });
    if (error) throw error;
    revalidatePath("/leads");
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

/** Recomputes the score from current data and the org's latest configuration; keeps score history. */
export async function rescoreLeads(ids: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    const list = z.array(id).min(1).max(500).parse(ids);
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const { data: leads } = await supabase.from("leads").select("*").in("id", list).eq("organization_id", orgId);
    const setup = await loadScoringSetup(orgId);
    const admin = createAdminClient();
    for (const l of leads ?? []) {
      const r = scoreLead({ name: l.name, company: l.company, email: l.email, phone: l.phone, website: l.website, country: l.country, industry: l.industry, source: l.source, discoveredAt: l.discovered_at }, setup.ctx, setup.cfg);
      await admin.from("leads").update({ score: r.score, qualification: r.qualification }).eq("id", l.id);
      await admin.from("lead_scores").insert({ organization_id: orgId, lead_id: l.id, score: r.score, qualification: r.qualification, factors: r.factors, explanation: r.explanation });
      await emitEvent(orgId, "lead.scored", l.id, { eventId: `scored:${l.id}:${r.score}:${Date.now()}` });
    }
    kick(); revalidatePath("/leads");
    return { ok: true, data: { count: leads?.length ?? 0 } };
  } catch (e) { return fail(msg(e)); }
}

export async function summarizeLead(leadId: string): Promise<ActionResult> {
  try {
    id.parse(leadId);
    const { orgId } = await requireRole(SALES);
    await generateLeadSummary(orgId, leadId);
    revalidatePath(`/leads/${leadId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof AiUnavailableError) return { ok: false, error: "AI isn't configured on this deployment (OPENAI_API_KEY or ANTHROPIC_API_KEY)." };
    return fail(msg(e));
  }
}

export async function importCsv(text: string, lawfulBasisConfirmed: boolean): Promise<ActionResult<{ created: number; duplicates: number; skipped: number }>> {
  try {
    if (!lawfulBasisConfirmed) throw new Error("Confirm that you have a lawful basis to hold and contact these people");
    const { orgId } = await requireRole(SALES);
    const rows = parseCsv(z.string().max(2_000_000).parse(text));
    if (rows.length < 2) throw new Error("The file needs a header row and at least one lead");
    if (rows.length > 501) throw new Error("Import up to 500 leads at a time");
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (names: string[]) => head.findIndex((h) => names.includes(h));
    const idx = { name: col(["name", "full name"]), company: col(["company", "organization"]), email: col(["email", "e-mail"]), phone: col(["phone", "telephone", "mobile"]), website: col(["website", "url"]), country: col(["country"]), industry: col(["industry"]) };
    if (idx.name < 0 && idx.company < 0 && idx.email < 0) throw new Error("No recognizable columns. Expected: name, company, email, phone, website, country, industry");
    const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
    const setup = await loadScoringSetup(orgId);
    let created = 0, duplicates = 0, skipped = 0;
    for (const r of rows.slice(1)) {
      const input: LeadInput = { name: get(r, idx.name), company: get(r, idx.company), email: get(r, idx.email), phone: get(r, idx.phone), website: get(r, idx.website), country: get(r, idx.country), industry: get(r, idx.industry), source: "csv_import", attribution: "CSV import", consent: { status: "unknown", legalBasis: "asserted by importing user" } };
      const o = await ingestLead(orgId, input, setup);
      if (o.outcome === "created") created++; else if (o.outcome === "duplicate") duplicates++; else if (o.outcome === "limit_reached") { skipped += 1; break; } else skipped++;
    }
    kick(); revalidatePath("/leads");
    return { ok: true, data: { created, duplicates, skipped } };
  } catch (e) { return fail(msg(e)); }
}

export async function addSuppression(email: string): Promise<ActionResult> {
  try {
    const n = normalizeEmail(email); if (!n) throw new Error("Enter a valid e-mail address");
    const { supabase, orgId } = await requireRole(SALES);
    const { error } = await supabase.from("suppression_list").upsert({ organization_id: orgId, email_normalized: n, reason: "manual" }, { onConflict: "organization_id,email_normalized", ignoreDuplicates: true });
    if (error) throw error;
    await supabase.from("leads").update({ consent_status: "withdrawn" }).eq("organization_id", orgId).eq("email_normalized", n);
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}

export async function dismissDuplicate(candidateId: string): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(SALES);
    const { error } = await supabase.from("duplicate_candidates").update({ status: "dismissed" }).eq("id", id.parse(candidateId)).eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  } catch (e) { return fail(msg(e)); }
}


import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { consume, refund } from "@/lib/billing/entitlements";
import { emitEvent } from "@/lib/events";
import { notifyOrg } from "@/lib/notify";
import { cleanText, domainFromEmail, normalizeDomain, normalizeEmail, normalizePhone } from "./normalize";
import { DEFAULT_CONFIG, scoreLead, type ScoringConfig, type ScoringContext } from "./scoring";

export interface LeadInput {
  name?: string | null; company?: string | null; email?: string | null; phone?: string | null; website?: string | null;
  country?: string | null; industry?: string | null; title?: string | null; intentText?: string | null;
  source: string; sourceRef?: string | null; attribution?: string | null; raw?: Record<string, unknown>;
  consent?: { status: "granted" | "denied" | "unknown"; evidence?: Record<string, unknown>; legalBasis?: string };
  campaignId?: string | null;
}
export type IngestOutcome = { outcome: "created" | "duplicate" | "suppressed" | "limit_reached" | "rejected" | "invalid"; leadId?: string; reason?: string };
export interface ScoringSetup { ctx: ScoringContext; cfg: ScoringConfig }

/** Loads what the scorer needs from the org's approved configuration. Cache this per batch. */
export async function loadScoringSetup(orgId: string): Promise<ScoringSetup> {
  const admin = createAdminClient();
  const [bp, prods, icps, sc] = await Promise.all([
    admin.from("business_profiles").select("target_countries, industry").eq("organization_id", orgId).maybeSingle(),
    admin.from("products_services").select("keywords, search_phrases").eq("organization_id", orgId).is("deleted_at", null),
    admin.from("ideal_customer_profiles").select("industries, buyer_roles, segments, intent_signals, keywords, regions").eq("organization_id", orgId).eq("status", "active"),
    admin.from("scoring_configs").select("*").eq("organization_id", orgId).maybeSingle(),
  ]);
  const flat = <T,>(rows: T[] | null | undefined, f: (r: T) => string[]) => [...new Set((rows ?? []).flatMap(f))];
  const ctx: ScoringContext = {
    keywords: [...flat(prods.data, (p) => [...p.keywords, ...p.search_phrases]), ...flat(icps.data, (i) => i.keywords)],
    targetCountries: [...(bp.data?.target_countries ?? []), ...flat(icps.data, (i) => i.regions)],
    industries: flat(icps.data, (i) => i.industries),
    buyerRoles: flat(icps.data, (i) => i.buyer_roles), segments: flat(icps.data, (i) => i.segments), intentSignals: flat(icps.data, (i) => i.intent_signals),
  };
  const cfg: ScoringConfig = sc.data ? { weights: sc.data.weights, hot: sc.data.hot_threshold, warm: sc.data.warm_threshold, cold: sc.data.cold_threshold } : DEFAULT_CONFIG;
  return { ctx, cfg };
}

/**
 * Single entry point for every lead source. Normalizes, scores, enforces plan limits, then stores atomically through
 * the ingest_lead SQL function (suppression + exact-email dedupe + duplicate candidates). Never invents or "verifies" data.
 */
export async function ingestLead(orgId: string, input: LeadInput, setup?: ScoringSetup): Promise<IngestOutcome> {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const name = cleanText(input.name, 160), company = cleanText(input.company, 160);
  if (!name && !company && !email) return { outcome: "invalid", reason: "A name, company or e-mail is required" };

  const website = cleanText(input.website, 300);
  const domain = normalizeDomain(website) ?? domainFromEmail(email);
  const { ctx, cfg } = setup ?? (await loadScoringSetup(orgId));
  const result = scoreLead({
    name, company, email, phone, website, country: cleanText(input.country, 80), industry: cleanText(input.industry, 120),
    source: input.source, discoveredAt: new Date(), intentText: cleanText(input.intentText, 2000), title: cleanText(input.title, 120),
  }, ctx, cfg);

  if (!(await consume(orgId, "leads_per_month"))) return { outcome: "limit_reached", reason: "Monthly lead limit for the current plan reached" };

  const consent = input.consent ?? { status: "unknown" as const };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ingest_lead", {
    p_org: orgId,
    p_lead: {
      name, company, email_n: email, phone: cleanText(input.phone, 40), phone_n: phone, website, domain_n: domain,
      country: cleanText(input.country, 80), industry: cleanText(input.industry, 120), source: input.source,
      source_ref: input.sourceRef ?? null, attribution: input.attribution ?? null, raw: input.raw ?? {},
      consent_status: consent.status, consent_evidence: consent.evidence ?? {}, legal_basis: consent.legalBasis ?? null,
      campaign_id: input.campaignId ?? null,
      // Provenance is explicit: contact fields are never marked verified unless a real verification flow set them.
      provenance: { email: email ? "unverified" : "missing", phone: phone ? "unverified" : "missing", country: input.country ? "unverified" : "missing" },
    },
    p_score: { score: result.score, qualification: result.qualification, factors: result.factors, explanation: result.explanation },
  });
  if (error) { await refund(orgId, "leads_per_month"); throw error; }

  const out = data as { outcome: IngestOutcome["outcome"]; lead_id?: string; reason?: string };
  if (out.outcome !== "created") await refund(orgId, "leads_per_month");
  if (out.outcome === "created" && out.lead_id) {
    const inbound = input.source === "web_form" || input.source === "inbound_webhook";
    await emitEvent(orgId, "lead.created", out.lead_id, { eventId: `created:${out.lead_id}` });
    if (inbound) await emitEvent(orgId, "lead.captured", out.lead_id, { eventId: `captured:${out.lead_id}` });
    await emitEvent(orgId, "lead.scored", out.lead_id, { eventId: `scored:${out.lead_id}:${result.score}` });
    if (result.qualification === "hot") {
      await notifyOrg(orgId, { roles: ["owner", "admin", "sales_manager"], kind: "high_priority_leads", type: "hot_lead",
        title: `Hot lead: ${name ?? company ?? email}`, body: `Score ${result.score}. ${result.explanation}`, link: `/leads/${out.lead_id}` }).catch(() => undefined);
    }
  }
  return { outcome: out.outcome, leadId: out.lead_id, reason: out.reason };
}

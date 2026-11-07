/**
 * Transparent, deterministic lead scoring (0-100). Every factor reports its evidence and whether the
 * underlying information is verified, inferred, unverified or missing: heuristic output is never
 * presented as fact. Weights and thresholds are per-organisation configuration.
 */
export type FactorKey = "relevance" | "geography" | "industry" | "profile" | "intent" | "completeness" | "recency" | "source";
export type Evidence = "verified" | "inferred" | "unverified" | "missing";

export interface ScoringContext {
  keywords: string[]; targetCountries: string[]; industries: string[]; buyerRoles: string[]; segments: string[]; intentSignals: string[];
}
export interface ScoringLead {
  name?: string | null; company?: string | null; email?: string | null; phone?: string | null; website?: string | null;
  country?: string | null; industry?: string | null; source: string; discoveredAt: Date | string; intentText?: string | null; title?: string | null;
}
export interface ScoringConfig {
  weights: Record<FactorKey, number>; hot: number; warm: number; cold: number;
}
export interface Factor { key: FactorKey; label: string; weight: number; value: number; points: number; evidence: Evidence; detail: string }
export interface ScoreResult { score: number; qualification: "hot" | "warm" | "cold" | "unqualified"; factors: Factor[]; explanation: string }

export const DEFAULT_CONFIG: ScoringConfig = {
  weights: { relevance: 25, geography: 15, industry: 10, profile: 15, intent: 15, completeness: 10, recency: 5, source: 5 },
  hot: 75, warm: 50, cold: 25,
};

const SOURCE_RELIABILITY: Record<string, number> = { web_form: 1, referral: 1, inbound_webhook: 0.8, manual: 0.7, csv_import: 0.6, google_places: 0.6 };
const GENERIC_INTENT = ["quote", "pricing", "price", "demo", "buy", "purchase", "looking for", "interested", "need ", "request", "proposal", "trial"];

const lc = (s?: string | null) => (s ?? "").toLowerCase();
const hits = (haystack: string, needles: string[]) => needles.filter((n) => n.trim() && haystack.includes(n.trim().toLowerCase()));
const clamp = (n: number) => Math.max(0, Math.min(1, n));

type Raw = { label: string; value: number; evidence: Evidence; detail: string };

export function scoreLead(lead: ScoringLead, ctx: ScoringContext, cfg: ScoringConfig = DEFAULT_CONFIG, now = new Date()): ScoreResult {
  const text = [lead.name, lead.company, lead.industry, lead.title, lead.intentText].map(lc).join(" ");
  const inbound = lead.source === "web_form" || lead.source === "referral" || lead.source === "inbound_webhook";

  const relevance = (): Raw => {
    if (!ctx.keywords.length) return { label: "Product relevance", value: 0.3, evidence: "missing", detail: "No product keywords configured; add them to improve matching." };
    const h = hits(text, ctx.keywords);
    return { label: "Product relevance", value: clamp(h.length / 2), evidence: h.length ? "inferred" : "missing", detail: h.length ? `Matched: ${h.join(", ")}` : "No product keywords found in lead details." };
  };
  const geography = (): Raw => {
    const c = lc(lead.country);
    if (!c) return { label: "Geographic fit", value: 0.3, evidence: "missing", detail: "Country unknown." };
    if (!ctx.targetCountries.length) return { label: "Geographic fit", value: 0.5, evidence: "unverified", detail: "No target markets configured." };
    const ok = ctx.targetCountries.some((t) => lc(t) === c || c.includes(lc(t)) || lc(t).includes(c));
    return { label: "Geographic fit", value: ok ? 1 : 0, evidence: "unverified", detail: ok ? `${lead.country} is a target market.` : `${lead.country} is outside target markets.` };
  };
  const industry = (): Raw => {
    const i = lc(lead.industry);
    if (!i) return { label: "Industry relevance", value: 0.3, evidence: "missing", detail: "Industry unknown." };
    if (!ctx.industries.length) return { label: "Industry relevance", value: 0.5, evidence: "unverified", detail: "No target industries configured." };
    const ok = ctx.industries.some((t) => i.includes(lc(t)) || lc(t).includes(i));
    return { label: "Industry relevance", value: ok ? 1 : 0, evidence: "unverified", detail: ok ? `Industry "${lead.industry}" matches your ICP.` : `Industry "${lead.industry}" not in your ICP.` };
  };
  const profile = (): Raw => {
    const targets = [...ctx.buyerRoles, ...ctx.segments];
    if (!targets.length) return { label: "Customer profile match", value: 0.3, evidence: "missing", detail: "No ICP roles or segments configured." };
    const h = hits(text, targets);
    return { label: "Customer profile match", value: clamp(h.length), evidence: h.length ? "inferred" : "missing", detail: h.length ? `Matches: ${h.join(", ")}` : "No role or segment evidence found." };
  };
  const intent = (): Raw => {
    const h = hits(text, [...ctx.intentSignals, ...GENERIC_INTENT]);
    if (inbound) return { label: "Buying intent", value: clamp(0.7 + h.length * 0.15), evidence: "verified", detail: "The prospect contacted you directly" + (h.length ? ` and mentioned: ${h.join(", ")}.` : ".") };
    return { label: "Buying intent", value: clamp(h.length * 0.4), evidence: h.length ? "inferred" : "missing", detail: h.length ? `Signals: ${h.join(", ")}` : "No explicit intent signals." };
  };
  const completeness = (): Raw => {
    const parts: [unknown, number, string][] = [[lead.email, 0.4, "email"], [lead.phone, 0.3, "phone"], [lead.website, 0.15, "website"], [lead.company, 0.15, "company"]];
    const have = parts.filter(([v]) => v);
    const miss = parts.filter(([v]) => !v).map(([, , n]) => n);
    return { label: "Contact completeness", value: clamp(have.reduce((a, [, w]) => a + w, 0)), evidence: have.length ? "unverified" : "missing", detail: miss.length ? `Missing: ${miss.join(", ")}. Contact details are not verified.` : "All contact fields present (not verified)." };
  };
  const recency = (): Raw => {
    const days = (now.getTime() - new Date(lead.discoveredAt).getTime()) / 86_400_000;
    const v = days <= 7 ? 1 : days <= 30 ? 0.6 : days <= 90 ? 0.3 : 0.1;
    return { label: "Recency", value: v, evidence: "verified", detail: `Discovered ${Math.max(0, Math.round(days))} day(s) ago.` };
  };
  const source = (): Raw => ({ label: "Source reliability", value: SOURCE_RELIABILITY[lead.source] ?? 0.5, evidence: "verified", detail: `Source: ${lead.source}.` });

  const raw: Record<FactorKey, Raw> = {
    relevance: relevance(), geography: geography(), industry: industry(), profile: profile(),
    intent: intent(), completeness: completeness(), recency: recency(), source: source(),
  };

  const keys = Object.keys(raw) as FactorKey[];
  const totalWeight = keys.reduce((a, k) => a + (cfg.weights[k] ?? 0), 0) || 1;
  const factors: Factor[] = keys.map((key) => {
    const w = cfg.weights[key] ?? 0;
    return { key, weight: w, ...raw[key], points: Math.round(((raw[key].value * w * 100) / totalWeight) * 10) / 10 };
  });
  const score = Math.max(0, Math.min(100, Math.round(factors.reduce((a, f) => a + f.points, 0))));
  const qualification = score >= cfg.hot ? "hot" : score >= cfg.warm ? "warm" : score >= cfg.cold ? "cold" : "unqualified";

  const top = [...factors].sort((a, b) => b.points - a.points).slice(0, 2).map((f) => f.label.toLowerCase());
  const gaps = factors.filter((f) => f.evidence === "missing").map((f) => f.label.toLowerCase());
  const explanation = `Scored ${score}/100 (${qualification}). Strongest signals: ${top.join(" and ")}.` +
    (gaps.length ? ` Missing information: ${gaps.join(", ")}.` : "") + " Scores combine rule-based matching against your profile; inferred items are not verified facts.";
  return { score, qualification, factors, explanation };
}

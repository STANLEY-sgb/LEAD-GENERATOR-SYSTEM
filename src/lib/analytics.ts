import "server-only";
import { getOrgContext } from "@/lib/org-context";

type Supa = Awaited<ReturnType<typeof getOrgContext>>["supabase"];
const tally = (rows: { [k: string]: unknown }[], key: string) => {
  const m = new Map<string, number>();
  for (const r of rows) { const k = String(r[key] ?? "Unknown") || "Unknown"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

/** All figures come from RLS-scoped database queries. Aggregation is capped at 20k recent leads per request. */
export async function loadAnalytics(supabase: Supa, orgId: string, days = 90) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data: leads }, { data: stages }, { data: camps }, { data: acts }] = await Promise.all([
    supabase.from("leads").select("id, source, industry, country, qualification, status, stage_id, created_at, converted_at, est_value, assigned_to, lost_reason, campaign_id").eq("organization_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }).limit(20000),
    supabase.from("pipeline_stages").select("id, name, position, kind").eq("organization_id", orgId).order("position"),
    supabase.from("campaigns").select("id, name").eq("organization_id", orgId),
    supabase.from("lead_activities").select("lead_id, type, created_at").eq("organization_id", orgId).eq("type", "stage_changed").gte("created_at", since).limit(20000),
  ]);
  const L = leads ?? [];
  const trend = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) trend.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), 0);
  for (const l of L) { const d = l.created_at.slice(0, 10); if (trend.has(d)) trend.set(d, trend.get(d)! + 1); }
  const monthly = new Map<string, number>();
  for (const l of L) { const m = l.created_at.slice(0, 7); monthly.set(m, (monthly.get(m) ?? 0) + 1); }

  const stageCounts = (stages ?? []).map((s) => ({ name: s.name, kind: s.kind, value: L.filter((l) => l.stage_id === s.id).length, est: L.filter((l) => l.stage_id === s.id).reduce((a, l) => a + (l.est_value ?? 0), 0) }));
  const converted = L.filter((l) => l.status === "converted");
  const total = L.length;
  const bySource = tally(L, "source");
  const sourceConv = bySource.map((s) => ({ name: s.name, leads: s.value, converted: converted.filter((c) => c.source === s.name).length }));
  const best = [...sourceConv].filter((s) => s.leads >= 1).sort((a, b) => (b.converted / b.leads) - (a.converted / a.leads) || b.leads - a.leads)[0];
  const campNames = new Map((camps ?? []).map((c) => [c.id, c.name]));

  return {
    total, converted: converted.length, rate: total ? Math.round((converted.length / total) * 1000) / 10 : 0,
    trend: [...trend.entries()].map(([date, leads]) => ({ date: date.slice(5), leads })),
    monthly: [...monthly.entries()].sort().slice(-12).map(([month, leads]) => ({ month, leads })),
    bySource, byIndustry: tally(L, "industry").slice(0, 8), byCountry: tally(L, "country").slice(0, 8), byQualification: tally(L, "qualification"),
    stageCounts, sourceConv, bestSource: best ?? null,
    lostReasons: tally(L.filter((l) => l.status === "lost"), "lost_reason").slice(0, 6),
    campaigns: tally(L.filter((l) => l.campaign_id).map((l) => ({ c: campNames.get(l.campaign_id!) ?? "Campaign" })), "c"),
    revenue: { won: converted.reduce((a, l) => a + (l.est_value ?? 0), 0), pipeline: L.filter((l) => !["converted", "lost"].includes(l.status)).reduce((a, l) => a + (l.est_value ?? 0), 0) },
    avgDaysToConvert: converted.length ? Math.round((converted.reduce((a, l) => a + (new Date(l.converted_at ?? l.created_at).getTime() - new Date(l.created_at).getTime()), 0) / converted.length / 86_400_000) * 10) / 10 : null,
    stageMoves: (acts ?? []).length,
  };
}

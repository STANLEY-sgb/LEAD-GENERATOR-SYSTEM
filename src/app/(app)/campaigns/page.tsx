import { getOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/ui/primitives";
import { CampaignManager, type CampaignRow } from "./manager";

export const metadata = { title: "Campaigns" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const orgId = org!.id;
  const [{ data: camps }, { data: leads }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
    supabase.from("leads").select("campaign_id, qualification, score, status, source").eq("organization_id", orgId).not("campaign_id", "is", null).is("deleted_at", null).limit(20000),
  ]);
  const rows: CampaignRow[] = (camps ?? []).map((c) => {
    const mine = (leads ?? []).filter((l) => l.campaign_id === c.id);
    const bySource: Record<string, number> = {};
    for (const l of mine) bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    const converted = mine.filter((l) => l.status === "converted").length;
    return {
      id: c.id, name: c.name, description: c.description ?? "", targetAudience: c.target_audience ?? "", markets: c.markets.join(", "), keywords: c.keywords.join(", "), sources: c.sources.join(", "),
      minScore: c.min_score, startsAt: c.starts_at ?? "", endsAt: c.ends_at ?? "", dailyLimit: c.daily_limit, spend: c.spend?.toString() ?? "", status: c.status,
      stats: { leads: mine.length, qualified: mine.filter((l) => (c.min_score > 0 ? (l.score ?? 0) >= c.min_score : l.qualification === "hot" || l.qualification === "warm")).length, converted, rate: mine.length ? Math.round((converted / mine.length) * 1000) / 10 : 0, cpl: c.spend != null && mine.length ? Math.round((Number(c.spend) / mine.length) * 100) / 100 : null, bySource },
    };
  });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Campaigns" description="Organize discovery by audience and market, and see what each campaign delivers." />
      <CampaignManager rows={rows} canManage={["owner", "admin", "sales_manager"].includes(role ?? "")} />
    </div>
  );
}

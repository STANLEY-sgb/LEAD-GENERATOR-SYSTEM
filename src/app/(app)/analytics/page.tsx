import { loadAnalytics } from "@/lib/analytics";
import { getOrgContext } from "@/lib/org-context";
import { BarsChart, DonutChart, TrendChart } from "@/components/charts";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Analytics" };

const Panel = ({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) => (
  <Card><h2 className="mb-2 font-semibold">{title}</h2>{empty ? <p className="py-10 text-center text-sm text-muted">No data yet</p> : children}</Card>
);

export default async function Page() {
  const { supabase, org } = await getOrgContext();
  const a = await loadAnalytics(supabase, org!.id);
  if (a.total === 0) return <div className="mx-auto max-w-5xl space-y-4"><PageHeader title="Analytics" /><EmptyState title="Nothing to analyse yet" body="Charts appear as soon as leads arrive from forms, imports or discovery." /></div>;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Analytics" description="Live from your workspace data (last 90 days for trends)." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Total leads", a.total], ["Converted", a.converted], ["Conversion rate", `${a.rate}%`], ["Avg. days to convert", a.avgDaysToConvert ?? "n/a"], ["Won value (est.)", a.revenue.won.toLocaleString()], ["Open pipeline (est.)", a.revenue.pipeline.toLocaleString()]].map(([k, v]) => <Card key={String(k)}><p className="text-sm text-muted">{k}</p><p className="mt-1 text-2xl font-bold">{v}</p></Card>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Lead acquisition (90 days)"><TrendChart data={a.trend} xKey="date" yKey="leads" /></Panel>
        <Panel title="Monthly growth"><BarsChart data={a.monthly} xKey="month" yKey="leads" /></Panel>
        <Panel title="Leads by source"><DonutChart data={a.bySource} /></Panel>
        <Panel title="Qualification" empty={!a.byQualification.length}><DonutChart data={a.byQualification} /></Panel>
        <Panel title="Pipeline by stage"><BarsChart data={a.stageCounts} horizontal /></Panel>
        <Panel title="Top industries" empty={!a.byIndustry.length}><BarsChart data={a.byIndustry} horizontal /></Panel>
        <Panel title="Top countries" empty={!a.byCountry.length}><BarsChart data={a.byCountry} horizontal /></Panel>
        <Panel title="Lost reasons" empty={!a.lostReasons.length}><BarsChart data={a.lostReasons} horizontal /></Panel>
      </div>
      <Panel title="Source performance">
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-muted"><tr><th className="p-2">Source</th><th className="p-2">Leads</th><th className="p-2">Converted</th><th className="p-2">Rate</th></tr></thead>
          <tbody>{a.sourceConv.map((s) => <tr key={s.name} className="border-t border-border"><td className="p-2">{s.name}</td><td className="p-2">{s.leads}</td><td className="p-2">{s.converted}</td><td className="p-2">{Math.round((s.converted / s.leads) * 1000) / 10}%</td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Flame, Inbox, Lightbulb, Phone, TrendingUp, Users, Trophy } from "lucide-react";
import { Card, EmptyState, QualBadge, Skeleton } from "@/components/ui/primitives";
import { BarsChart, DonutChart, TrendChart } from "@/components/charts";
import { loadAnalytics } from "@/lib/analytics";
import { getOrgContext } from "@/lib/org-context";

export const metadata = { title: "Overview" };

async function Content() {
  const { supabase, org } = await getOrgContext();
  const orgId = org!.id;
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const base = () => supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", orgId).is("deleted_at", null);

  // Every figure is a live, RLS-scoped query.
  const [total, today, hot, warm, contacted, converted, a, newest, wins, execs, acts, attention, overdue, onboarding] = await Promise.all([
    base(), base().gte("created_at", day.toISOString()), base().eq("qualification", "hot"), base().eq("qualification", "warm"),
    base().in("status", ["contacted", "converted"]), base().eq("status", "converted"), loadAnalytics(supabase, orgId, 30),
    supabase.from("leads").select("id, name, company, source, score, qualification, created_at").eq("organization_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("leads").select("id, name, company, converted_at").eq("organization_id", orgId).eq("status", "converted").order("converted_at", { ascending: false }).limit(3),
    supabase.from("automation_executions").select("id, status, started_at, automation_workflows(name)").eq("organization_id", orgId).order("started_at", { ascending: false }).limit(4),
    supabase.from("lead_activities").select("id, type, body, created_at, leads(name)").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5),
    supabase.from("leads").select("id, name, score").eq("organization_id", orgId).is("deleted_at", null).eq("qualification", "hot").eq("status", "new").order("score", { ascending: false }).limit(5),
    supabase.from("follow_up_tasks").select("id", { count: "exact", head: true }).eq("organization_id", orgId).is("completed_at", null).lt("due_at", new Date().toISOString()),
    supabase.from("business_profiles").select("description, target_countries").eq("organization_id", orgId).single(),
  ]);
  const t = total.count ?? 0;
  const rate = t ? Math.round(((converted.count ?? 0) / t) * 1000) / 10 : 0;
  const kpis = [
    { label: "Total leads", value: t, icon: Users }, { label: "New today", value: today.count ?? 0, icon: Inbox },
    { label: "Qualified (hot + warm)", value: (hot.count ?? 0) + (warm.count ?? 0), icon: CheckCircle2 }, { label: "Hot leads", value: hot.count ?? 0, icon: Flame },
    { label: "Contacted", value: contacted.count ?? 0, icon: Phone }, { label: "Converted", value: converted.count ?? 0, icon: Trophy },
    { label: "Conversion rate", value: `${rate}%`, icon: TrendingUp },
  ];

  const insights: string[] = [];
  if (a.bestSource && a.bestSource.leads >= 3) insights.push(`Best-performing source: ${a.bestSource.name} (${a.bestSource.leads} leads, ${a.bestSource.converted} converted).`);
  if (a.byIndustry[0]) insights.push(`Most common customer segment: ${a.byIndustry[0].name} (${a.byIndustry[0].value} leads).`);
  if ((attention.data?.length ?? 0) > 0) insights.push(`${attention.data!.length} hot lead(s) are still untouched in "New".`);
  if ((overdue.count ?? 0) > 0) insights.push(`${overdue.count} follow-up task(s) are overdue.`);
  if (!onboarding.data?.description) insights.push("Add a business description so scoring can match prospects better.");
  if (!(onboarding.data?.target_countries?.length)) insights.push("Set your target countries to improve geographic scoring.");

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {kpis.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-4"><div className="flex items-center justify-between text-xs text-muted">{label}<Icon size={16} className="text-accent" /></div><p className="mt-2 text-2xl font-bold">{value}</p></Card>
        ))}
      </div>

      {t === 0 ? (
        <EmptyState title="Your workspace is ready for its first leads" body="Complete your business profile, then share a capture form, import a CSV or run a discovery source. Everything here updates automatically.">
          <Link href="/business-profile" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Business profile</Link>
          <Link href="/capture" className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold">Create a form</Link>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2"><h2 className="mb-2 font-semibold">Lead acquisition (30 days)</h2><TrendChart data={a.trend} xKey="date" yKey="leads" /></Card>
          <Card><h2 className="mb-2 font-semibold">By qualification</h2><DonutChart data={a.byQualification} /></Card>
          <Card><h2 className="mb-2 font-semibold">By source</h2><BarsChart data={a.bySource} horizontal /></Card>
          <Card><h2 className="mb-2 font-semibold">Pipeline</h2><BarsChart data={a.stageCounts} horizontal /></Card>
          <Card><h2 className="mb-2 font-semibold">Top industries</h2>{a.byIndustry.length ? <BarsChart data={a.byIndustry} horizontal /> : <p className="py-10 text-center text-sm text-muted">No industry data yet</p>}</Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-2">
          <h2 className="flex items-center gap-2 font-semibold"><Lightbulb size={16} className="text-accent" /> Insights <span className="text-xs font-normal text-muted">(computed from your data)</span></h2>
          {insights.length ? <ul className="space-y-2 text-sm">{insights.map((i) => <li key={i}>• {i}</li>)}</ul> : <p className="text-sm text-muted">Insights appear as data accumulates.</p>}
          {(attention.data?.length ?? 0) > 0 && <div className="border-t border-border pt-2"><p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-muted"><AlertTriangle size={12} /> Needs attention</p>{attention.data!.map((l) => <Link key={l.id} href={`/leads/${l.id}`} className="block truncate text-sm underline">{l.name} · {l.score}</Link>)}</div>}
        </Card>
        <Card className="space-y-2"><h2 className="font-semibold">Recently discovered</h2>
          {(newest.data ?? []).length === 0 ? <p className="text-sm text-muted">None yet</p> : (newest.data ?? []).map((l) => <div key={l.id} className="flex items-center justify-between gap-2 text-sm"><Link href={`/leads/${l.id}`} className="min-w-0 truncate hover:underline">{l.name}</Link><QualBadge q={l.qualification} /></div>)}
          {(wins.data ?? []).length > 0 && <div className="border-t border-border pt-2"><p className="mb-1 text-xs font-semibold uppercase text-muted">Recent conversions</p>{wins.data!.map((l) => <Link key={l.id} href={`/leads/${l.id}`} className="block truncate text-sm hover:underline">🎉 {l.name}</Link>)}</div>}
        </Card>
        <Card className="space-y-2"><h2 className="font-semibold">Activity</h2>
          {(acts.data ?? []).map((x) => <p key={x.id} className="truncate text-sm"><b className="capitalize">{x.type.replace("_", " ")}</b> · {(x.leads as unknown as { name: string } | null)?.name ?? ""}</p>)}
          {(execs.data ?? []).length > 0 && <div className="border-t border-border pt-2"><p className="mb-1 text-xs font-semibold uppercase text-muted">Automations</p>{execs.data!.map((e) => <p key={e.id} className="truncate text-sm">{(e.automation_workflows as unknown as { name: string } | null)?.name} <span className="text-muted">· {e.status}</span></p>)}</div>}
          {(acts.data ?? []).length === 0 && (execs.data ?? []).length === 0 && <p className="text-sm text-muted">No activity yet</p>}
        </Card>
      </div>
    </>
  );
}

function Fallback() {
  return <div className="space-y-6"><div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div>;
}

export default async function DashboardPage() {
  const { org } = await getOrgContext();
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div><h1 className="text-2xl font-bold">Welcome, {org!.name}</h1><p className="text-sm text-muted">Live figures from your workspace.</p></div>
      <Suspense fallback={<Fallback />}><Content /></Suspense>
    </div>
  );
}

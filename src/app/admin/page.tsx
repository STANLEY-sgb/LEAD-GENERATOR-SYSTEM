import { requireSuperAdmin } from "@/lib/admin";
import { daysAgoIso } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui/primitives";

export default async function Page() {
  const { admin } = await requireSuperAdmin();
  const c = (t: string, f?: (q: any) => any) => { const q = admin.from(t).select("id", { count: "exact", head: true }); return (f ? f(q) : q).then((r: { count: number | null }) => r.count ?? 0); }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const month = new Date().toISOString().slice(0, 7);
  const since = daysAgoIso(1);
  const [orgs, active, suspended, users, leads, execs24, failed24, paid, queued, dead, usage, plans, subs] = await Promise.all([
    c("organizations"), c("organizations", (q) => q.eq("status", "active")), c("organizations", (q) => q.eq("status", "suspended")), c("profiles"), c("leads"),
    c("automation_executions", (q) => q.gte("started_at", since)), c("automation_executions", (q) => q.eq("status", "failed").gte("started_at", since)),
    c("subscriptions", (q) => q.neq("plan_id", "starter").eq("status", "active")), c("jobs", (q) => q.eq("status", "queued")), c("jobs", (q) => q.eq("status", "dead")),
    admin.from("usage_records").select("metric, quantity").eq("period", month), admin.from("plans").select("id, price_cents"), admin.from("subscriptions").select("plan_id, status"),
  ]);
  const price = new Map((plans.data ?? []).map((p) => [p.id, p.price_cents]));
  const mrr = (subs.data ?? []).filter((s) => s.status === "active").reduce((a, s) => a + (price.get(s.plan_id) ?? 0), 0);
  const use: Record<string, number> = {};
  for (const u of usage.data ?? []) use[u.metric] = (use[u.metric] ?? 0) + Number(u.quantity);
  const stats: [string, string | number][] = [["Organizations", orgs], ["Active", active], ["Suspended", suspended], ["Registered users", users], ["Leads processed", leads], ["Paid subscriptions", paid], ["MRR (list price)", (mrr / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })], ["Automation runs (24h)", execs24], ["Automation failures (24h)", failed24], ["Jobs queued", queued], ["Jobs dead-lettered", dead]];
  return (
    <>
      <PageHeader title="Platform overview" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{stats.map(([k, v]) => <Card key={k}><p className="text-sm text-muted">{k}</p><p className="mt-1 text-2xl font-bold">{v}</p></Card>)}</div>
      <Card><h2 className="mb-2 font-semibold">API / metered usage this month ({month})</h2><ul className="grid gap-1 text-sm sm:grid-cols-2">{Object.entries(use).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><b>{v.toLocaleString()}</b></li>)}{Object.keys(use).length === 0 && <li className="text-muted">No usage recorded</li>}</ul></Card>
    </>
  );
}

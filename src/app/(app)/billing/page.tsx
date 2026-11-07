import { getLimits } from "@/lib/billing/entitlements";
import { stripeConfigured } from "@/lib/billing/stripe";
import { getOrgContext } from "@/lib/org-context";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { PlanButtons } from "./plans";

export const metadata = { title: "Billing" };
const LABEL: Record<string, string> = { leads_per_month: "Leads / month", ai_calls_per_month: "AI calls / month", discovery_runs_per_month: "Discovery runs / month", workflows: "Workflows", campaigns: "Campaigns", members: "Team members" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const orgId = org!.id;
  const period = new Date().toISOString().slice(0, 7);
  const [{ plan, status, limits }, { data: plans }, { data: usage }, { data: invoices }, { data: sub }] = await Promise.all([
    getLimits(orgId),
    supabase.from("plans").select("id, name, price_cents, features, limits, stripe_price_id").order("sort"),
    supabase.from("usage_records").select("metric, quantity").eq("organization_id", orgId).eq("period", period),
    supabase.from("invoices").select("id, amount_cents, currency, status, hosted_url, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(12),
    supabase.from("subscriptions").select("current_period_end, stripe_customer_id").eq("organization_id", orgId).single(),
  ]);
  const used = new Map((usage ?? []).map((u) => [u.metric, Number(u.quantity)]));
  const [{ count: wf }, { count: cp }, { count: mem }] = await Promise.all([
    supabase.from("automation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
  ]);
  used.set("workflows", wf ?? 0); used.set("campaigns", cp ?? 0); used.set("members", mem ?? 0);
  const money = (c: number, cur = "usd") => new Intl.NumberFormat(undefined, { style: "currency", currency: cur.toUpperCase() }).format(c / 100);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Subscription & billing" description={`Current plan: ${plan} (${status})${sub?.current_period_end ? ` · renews ${new Date(sub.current_period_end).toLocaleDateString()}` : ""}`} />
      {!stripeConfigured() && <p className="rounded-lg bg-accent/15 p-3 text-sm">Online payments aren&apos;t configured on this deployment (<code>STRIPE_SECRET_KEY</code>). Plan limits are still enforced.</p>}
      <Card className="space-y-3">
        <h2 className="font-semibold">Usage this month</h2>
        <div className="grid gap-3 sm:grid-cols-2">{Object.entries(LABEL).map(([k, label]) => { const u = used.get(k) ?? 0, lim = limits[k as keyof typeof limits] ?? 0, pct = Math.min(100, lim ? (u / lim) * 100 : 100); return (
          <div key={k}><div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums">{u.toLocaleString()} / {lim.toLocaleString()}</span></div><div className="mt-1 h-2 rounded bg-black/10 dark:bg-white/10"><div className={`h-full rounded ${pct >= 90 ? "bg-accent" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div></div>); })}</div>
      </Card>
      <div className="grid gap-4 md:grid-cols-4">
        {(plans ?? []).map((p) => (
          <Card key={p.id} className={`space-y-2 ${p.id === plan ? "ring-2 ring-primary" : ""}`}>
            <div className="flex items-center justify-between"><h3 className="font-semibold">{p.name}</h3>{p.id === plan && <Badge tone="success">Current</Badge>}</div>
            <p className="text-2xl font-bold">{p.id === "enterprise" ? "Custom" : p.price_cents === 0 ? "Free" : `${money(p.price_cents)}`}<span className="text-sm font-normal text-muted">{p.price_cents > 0 ? "/mo" : ""}</span></p>
            <ul className="space-y-1 text-xs text-muted">{(p.features as string[]).map((f) => <li key={f}>• {f}</li>)}<li>• {(p.limits as Record<string, number>).leads_per_month?.toLocaleString()} leads / month</li></ul>
            {(role === "owner" || role === "admin") && p.id !== plan && <PlanButtons planId={p.id} purchasable={Boolean(p.stripe_price_id) && stripeConfigured()} enterprise={p.id === "enterprise"} />}
          </Card>
        ))}
      </div>
      {sub?.stripe_customer_id && (role === "owner" || role === "admin") && <PlanButtons portal />}
      <Card className="space-y-2"><h2 className="font-semibold">Invoices</h2>
        {(invoices ?? []).length === 0 ? <p className="text-sm text-muted">No invoices yet.</p> : <ul className="divide-y divide-border text-sm">{invoices!.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{new Date(i.created_at).toLocaleDateString()} · {money(i.amount_cents, i.currency)} <Badge>{i.status}</Badge></span>{i.hosted_url && <a className="underline" href={i.hosted_url} target="_blank" rel="noreferrer">View</a>}</li>)}</ul>}
      </Card>
    </div>
  );
}

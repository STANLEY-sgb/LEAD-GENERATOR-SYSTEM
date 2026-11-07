import { requireSuperAdmin } from "@/lib/admin";
import { CONNECTORS } from "@/lib/connectors";
import { aiProviderConfigured } from "@/lib/env";
import { emailConfigured } from "@/lib/email";
import { encryptionConfigured } from "@/lib/crypto";
import { stripeConfigured } from "@/lib/billing/stripe";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { DeadJobs } from "./dead-jobs";

export default async function Page() {
  const { admin } = await requireSuperAdmin();
  const [{ data: counts }, { data: dead }, { data: failing }, { data: runs }] = await Promise.all([
    admin.from("jobs").select("status").limit(50000),
    admin.from("jobs").select("id, type, last_error, attempts, organization_id, created_at").eq("status", "dead").order("created_at", { ascending: false }).limit(25),
    admin.from("automation_executions").select("id, error, started_at, organization_id").eq("status", "failed").order("started_at", { ascending: false }).limit(15),
    admin.from("discovery_runs").select("id, connector, error, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(10),
  ]);
  const by: Record<string, number> = {};
  for (const j of counts ?? []) by[j.status] = (by[j.status] ?? 0) + 1;
  const services: [string, boolean][] = [["AI provider", aiProviderConfigured()], ["Email (Resend)", emailConfigured()], ["Stripe", stripeConfigured()], ["Credential encryption", encryptionConfigured()], ["Cron secret", Boolean(process.env.CRON_SECRET)], ...CONNECTORS.filter((c) => c.kind === "discovery").map((c): [string, boolean] => [c.name, c.configured()])];
  return (
    <>
      <PageHeader title="System health" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2"><h2 className="font-semibold">Job queue</h2><div className="flex flex-wrap gap-2 text-sm">{["queued", "running", "succeeded", "failed", "dead"].map((s) => <Badge key={s} tone={s === "dead" ? "warning" : "neutral"}>{s}: {by[s] ?? 0}</Badge>)}</div>{!process.env.CRON_SECRET && <p className="rounded bg-accent/15 p-2 text-xs">CRON_SECRET is not set: the scheduled worker endpoint is disabled. Jobs still run opportunistically after user actions.</p>}</Card>
        <Card className="space-y-2"><h2 className="font-semibold">Services</h2><ul className="space-y-1 text-sm">{services.map(([n, ok]) => <li key={n} className="flex justify-between"><span>{n}</span><Badge tone={ok ? "success" : "warning"}>{ok ? "configured" : "not configured"}</Badge></li>)}</ul></Card>
      </div>
      <Card className="space-y-2"><h2 className="font-semibold">Dead-letter queue</h2><DeadJobs jobs={(dead ?? []).map((j) => ({ id: j.id, type: j.type, error: j.last_error ?? "", attempts: j.attempts }))} /></Card>
      <Card className="space-y-2"><h2 className="font-semibold">Recent error log</h2>
        <ul className="space-y-1 text-sm">{(failing ?? []).map((e) => <li key={e.id}><span className="text-muted">{new Date(e.started_at).toLocaleString()}</span> automation: {e.error}</li>)}{(runs ?? []).map((e) => <li key={e.id}><span className="text-muted">{new Date(e.created_at).toLocaleString()}</span> discovery ({e.connector}): {e.error}</li>)}{(failing ?? []).length + (runs ?? []).length === 0 && <li className="text-muted">No recent errors</li>}</ul></Card>
    </>
  );
}

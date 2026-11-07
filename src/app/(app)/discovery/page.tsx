import { CONNECTORS, PLANNED_INTEGRATIONS } from "@/lib/connectors";
import { getOrgContext } from "@/lib/org-context";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DiscoveryForm } from "./form";

export const metadata = { title: "Lead discovery" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const orgId = org!.id;
  const [{ data: runs }, { data: camps }, { data: prods }] = await Promise.all([
    supabase.from("discovery_runs").select("id, connector, query, status, found, created, duplicates, error, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
    supabase.from("campaigns").select("id, name").eq("organization_id", orgId).eq("status", "active"),
    supabase.from("products_services").select("keywords").eq("organization_id", orgId).is("deleted_at", null),
  ]);
  const discoverable = CONNECTORS.filter((c) => c.kind === "discovery").map((c) => ({ id: c.id, name: c.name, configured: c.configured(), setup: c.setup, required: c.requiredEnv }));
  const suggested = [...new Set((prods ?? []).flatMap((p) => p.keywords))].slice(0, 5).join(", ");
  const canRun = ["owner", "admin", "sales_manager"].includes(role ?? "");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Lead discovery" description="Runs execute in the background through official APIs and permitted sources. Results are scored and de-duplicated automatically." />
      <DiscoveryForm connectors={discoverable} campaigns={camps ?? []} suggested={suggested} canRun={canRun} />
      <Card className="space-y-2">
        <h2 className="font-semibold">Other ways leads arrive</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {CONNECTORS.filter((c) => c.kind === "inbound").map((c) => <li key={c.id} className="rounded-lg bg-black/5 p-3 dark:bg-white/5"><b>{c.name}</b><br /><span className="text-muted">{c.description}</span></li>)}
        </ul>
        <h3 className="pt-2 text-sm font-semibold">Not yet available</h3>
        <ul className="space-y-1 text-sm text-muted">{PLANNED_INTEGRATIONS.map((p) => <li key={p.id}><Badge>Not connected</Badge> <b className="text-foreground">{p.name}</b>: {p.note}</li>)}</ul>
      </Card>
      <section>
        <h2 className="mb-2 font-semibold">Recent runs</h2>
        {(runs ?? []).length === 0 ? <EmptyState title="No discovery runs yet" body="Start a run above once a source is configured." /> : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted"><tr><th className="p-3">Source</th><th className="p-3">Query</th><th className="p-3">Status</th><th className="p-3">Found</th><th className="p-3">New</th><th className="p-3">Duplicates</th><th className="p-3">When</th></tr></thead>
              <tbody>{runs!.map((r) => <tr key={r.id} className="border-b border-border last:border-0"><td className="p-3">{r.connector}</td><td className="max-w-56 truncate p-3 text-muted">{(r.query as { keywords?: string[] }).keywords?.join(", ")}</td><td className="p-3"><Badge tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "warning" : "neutral"}>{r.status}</Badge>{r.error && <p className="text-xs text-red-600">{r.error}</p>}</td><td className="p-3">{r.found}</td><td className="p-3">{r.created}</td><td className="p-3">{r.duplicates}</td><td className="whitespace-nowrap p-3 text-muted">{new Date(r.created_at).toLocaleString()}</td></tr>)}</tbody></table>
          </Card>
        )}
      </section>
    </div>
  );
}

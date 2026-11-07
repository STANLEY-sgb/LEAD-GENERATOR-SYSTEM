import { requireSuperAdmin } from "@/lib/admin";
import { Card, PageHeader } from "@/components/ui/primitives";

export default async function Page() {
  const { admin } = await requireSuperAdmin();
  const { data } = await admin.from("audit_logs").select("id, action, entity, entity_id, actor_id, organization_id, metadata, created_at").order("created_at", { ascending: false }).limit(200);
  return (
    <>
      <PageHeader title="Audit log" description="Administrative and sensitive actions across the platform (latest 200)." />
      <Card className="overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted"><tr><th className="p-3">When</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Actor</th><th className="p-3">Details</th></tr></thead>
        <tbody>{(data ?? []).map((a) => <tr key={a.id} className="border-b border-border last:border-0"><td className="whitespace-nowrap p-3 text-muted">{new Date(a.created_at).toLocaleString()}</td><td className="p-3 font-medium">{a.action}</td><td className="p-3">{a.entity} <span className="text-xs text-muted">{a.entity_id?.slice(0, 8)}</span></td><td className="p-3 text-xs text-muted">{a.actor_id?.slice(0, 8) ?? "system"}</td><td className="max-w-64 truncate p-3 text-xs text-muted">{JSON.stringify(a.metadata)}</td></tr>)}</tbody></table></Card>
    </>
  );
}

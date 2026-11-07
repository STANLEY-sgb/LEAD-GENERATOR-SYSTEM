import { requireSuperAdmin } from "@/lib/admin";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { admin } = await requireSuperAdmin();
  let query = admin.from("profiles").select("id, full_name, email, is_super_admin, created_at").order("created_at", { ascending: false }).limit(200);
  const term = (q ?? "").replace(/[,()%*\\]/g, " ").trim();
  if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const { data: users } = await query;
  const { data: ms } = await admin.from("organization_members").select("user_id, role, organizations(name)").in("user_id", (users ?? []).map((u) => u.id));
  return (
    <>
      <PageHeader title="Users" description="Read-only. Super-admin status can only be granted with the service role (see docs/SETUP.md)." />
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search e-mail or name" aria-label="Search users" className="min-h-10 flex-1 rounded-lg border border-border bg-card px-3 text-sm" /><button className="rounded-lg bg-navy px-4 text-sm font-semibold text-white">Search</button></form>
      <Card className="overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted"><tr><th className="p-3">User</th><th className="p-3">Organizations</th><th className="p-3">Joined</th></tr></thead>
        <tbody>{(users ?? []).map((u) => <tr key={u.id} className="border-b border-border last:border-0"><td className="p-3"><b>{u.full_name || "-"}</b> {u.is_super_admin && <Badge tone="warning">super admin</Badge>}<br /><span className="text-xs text-muted">{u.email}</span></td><td className="p-3">{(ms ?? []).filter((m) => m.user_id === u.id).map((m) => `${(m.organizations as unknown as { name: string } | null)?.name} (${m.role})`).join(", ") || "-"}</td><td className="whitespace-nowrap p-3 text-muted">{new Date(u.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></Card>
    </>
  );
}

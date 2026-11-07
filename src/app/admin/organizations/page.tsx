import { requireSuperAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/ui/primitives";
import { OrgTable } from "./table";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { admin } = await requireSuperAdmin();
  let query = admin.from("organizations").select("id, name, slug, status, created_at, subscriptions(plan_id, status, limit_overrides)").order("created_at", { ascending: false }).limit(200);
  const term = (q ?? "").replace(/[,()%*\\]/g, " ").trim();
  if (term) query = query.ilike("name", `%${term}%`);
  const [{ data: orgs }, { data: plans }] = await Promise.all([query, admin.from("plans").select("id, name").order("sort")]);
  const ids = (orgs ?? []).map((o) => o.id);
  const [{ data: leads }, { data: members }] = await Promise.all([admin.from("leads").select("organization_id").in("organization_id", ids).limit(100000), admin.from("organization_members").select("organization_id").in("organization_id", ids)]);
  const count = (rows: { organization_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.organization_id === id).length;
  return (
    <>
      <PageHeader title="Organizations" />
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search by name" aria-label="Search organizations" className="min-h-10 flex-1 rounded-lg border border-border bg-card px-3 text-sm" /><button className="rounded-lg bg-navy px-4 text-sm font-semibold text-white">Search</button></form>
      <OrgTable plans={plans ?? []} rows={(orgs ?? []).map((o) => { const s = (o.subscriptions as unknown as { plan_id: string; status: string; limit_overrides: object } | null); return { id: o.id, name: o.name, slug: o.slug, status: o.status, plan: s?.plan_id ?? "starter", subStatus: s?.status ?? "", overrides: JSON.stringify(s?.limit_overrides ?? {}), leads: count(leads, o.id), members: count(members, o.id), created: o.created_at }; })} />
    </>
  );
}

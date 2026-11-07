import Link from "next/link";
import { Download } from "lucide-react";
import { getMembers, getOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/ui/primitives";
import { LeadsTable, type LeadRow } from "./table";
import { LeadTools } from "./tools";

export const metadata = { title: "Leads" };
const PAGE = 25;
const SORTS = new Set(["created_at", "score", "name", "company"]);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await getOrgContext();
  const orgId = org!.id;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = SORTS.has(sp.sort ?? "") ? sp.sort! : "created_at";
  const asc = sp.dir === "asc";

  let q = supabase.from("leads").select("id, name, company, email, phone, country, industry, source, score, qualification, status, assigned_to, created_at, consent_status", { count: "exact" })
    .eq("organization_id", orgId).is("deleted_at", null);
  const term = (sp.q ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
  if (term) q = q.or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  if (sp.qual) q = q.eq("qualification", sp.qual);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.source) q = q.eq("source", sp.source);
  if (sp.assigned === "me") { const { userId } = await getOrgContext(); q = q.eq("assigned_to", userId); }
  if (sp.assigned === "none") q = q.is("assigned_to", null);
  const { data, count } = await q.order(sort, { ascending: asc, nullsFirst: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const members = await getMembers(supabase, orgId);
  const name = new Map(members.map((m) => [m.user_id, m.name]));
  const rows: LeadRow[] = (data ?? []).map((l) => ({ ...l, assignee: l.assigned_to ? name.get(l.assigned_to) ?? "Member" : null }));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const canWrite = role !== "analyst";

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as [string, string][]);
    return `/leads?${p}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title="Leads" description={`${count ?? 0} lead${count === 1 ? "" : "s"}`}
        actions={<><a href={`/api/leads/export?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][])}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"><Download size={16} /> Export CSV</a>
          {canWrite && <LeadTools />}</>} />
      <form className="flex flex-wrap gap-2" action="/leads">
        <input name="q" defaultValue={sp.q} placeholder="Search name, company, email, phone…" aria-label="Search leads" className="min-h-10 min-w-0 flex-1 basis-56 rounded-lg border border-border bg-card px-3 text-sm" />
        <select name="qual" defaultValue={sp.qual ?? ""} aria-label="Qualification" className="min-h-10 rounded-lg border border-border bg-card px-2 text-sm"><option value="">All qualifications</option>{["hot", "warm", "cold", "unqualified"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="min-h-10 rounded-lg border border-border bg-card px-2 text-sm"><option value="">All statuses</option>{["new", "qualified", "contacted", "converted", "lost"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select name="assigned" defaultValue={sp.assigned ?? ""} aria-label="Assignment" className="min-h-10 rounded-lg border border-border bg-card px-2 text-sm"><option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option></select>
        <select name="sort" defaultValue={sort} aria-label="Sort by" className="min-h-10 rounded-lg border border-border bg-card px-2 text-sm"><option value="created_at">Newest</option><option value="score">Score</option><option value="name">Name</option><option value="company">Company</option></select>
        <select name="dir" defaultValue={sp.dir ?? "desc"} aria-label="Direction" className="min-h-10 rounded-lg border border-border bg-card px-2 text-sm"><option value="desc">Descending</option><option value="asc">Ascending</option></select>
        <button className="min-h-10 rounded-lg bg-navy px-4 text-sm font-semibold text-white">Apply</button>
      </form>
      <LeadsTable rows={rows} members={members.map((m) => ({ id: m.user_id, name: m.name }))} canWrite={canWrite} />
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Page {page} of {pages}</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="rounded-lg border border-border bg-card px-3 py-2" href={qs({ page: String(page - 1) })}>Previous</Link>}
          {page < pages && <Link className="rounded-lg border border-border bg-card px-3 py-2" href={qs({ page: String(page + 1) })}>Next</Link>}
        </div>
      </div>
    </div>
  );
}

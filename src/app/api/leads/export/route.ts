import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org-context";
import { escapeCsvCell } from "@/lib/leads/normalize";

export const dynamic = "force-dynamic";

/** CSV export of the caller's organization leads (RLS-scoped, same filters as the list). Formula-injection safe. */
export async function GET(req: NextRequest) {
  const { supabase, org } = await getOrgContext();
  if (!org) return NextResponse.json({ error: "no organization" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  let q = supabase.from("leads").select("name, company, email, phone, website, country, industry, source, score, qualification, status, consent_status, discovered_at").eq("organization_id", org.id).is("deleted_at", null);
  const term = (sp.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
  if (term) q = q.or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  for (const k of ["qualification:qual", "status:status", "source:source"]) { const [col, param] = k.split(":"); const v = sp.get(param); if (v) q = q.eq(col, v); }
  const { data } = await q.order("created_at", { ascending: false }).limit(10_000);
  const cols = ["name", "company", "email", "phone", "website", "country", "industry", "source", "score", "qualification", "status", "consent_status", "discovered_at"] as const;
  const csv = [cols.join(","), ...(data ?? []).map((r) => cols.map((c) => escapeCsvCell(r[c])).join(","))].join("\r\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}

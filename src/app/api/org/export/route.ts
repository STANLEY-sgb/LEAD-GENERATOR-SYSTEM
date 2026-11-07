import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org-context";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TABLES = ["business_profiles", "products_services", "ideal_customer_profiles", "leads", "lead_notes", "lead_tags", "lead_activities", "lead_scores", "lead_sources_history", "follow_up_tasks", "pipeline_stages", "campaigns", "automation_workflows", "suppression_list", "lead_forms", "scoring_configs"] as const;

/** Data portability: full JSON export for owners/admins. Role is verified server-side; data is read scoped to the caller's org. */
export async function GET() {
  const { supabase, org, role, userId } = await getOrgContext();
  if (!org || !role || !["owner", "admin"].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), organization: { id: org.id, name: org.name } };
  for (const t of TABLES) {
    const { data } = await supabase.from(t).select("*").eq("organization_id", org.id).limit(100_000);
    out[t] = data ?? [];
  }
  await createAdminClient().from("audit_logs").insert({ organization_id: org.id, actor_id: userId, action: "organization.exported", entity: "organizations", entity_id: org.id });
  return new NextResponse(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="export-${org.id}.json"`, "cache-control": "no-store" } });
}

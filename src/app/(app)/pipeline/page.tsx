import { getOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/ui/primitives";
import { Board, type BoardLead, type BoardStage } from "./board";

export const metadata = { title: "Pipeline" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const orgId = org!.id;
  const [{ data: stages }, { data: leads }] = await Promise.all([
    supabase.from("pipeline_stages").select("id, name, kind, position").eq("organization_id", orgId).order("position"),
    supabase.from("leads").select("id, name, company, score, qualification, est_value, stage_id").eq("organization_id", orgId).is("deleted_at", null).order("score", { ascending: false, nullsFirst: false }).limit(500),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Sales pipeline" description="Drag leads between stages. Showing the top 500 leads by score." />
      <Board stages={(stages ?? []) as BoardStage[]} leads={(leads ?? []) as BoardLead[]} canWrite={role !== "analyst"} canManage={["owner", "admin", "sales_manager"].includes(role ?? "")} />
    </div>
  );
}

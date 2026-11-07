import { getMembers, getOrgContext } from "@/lib/org-context";
import { emailConfigured } from "@/lib/email";
import { PageHeader } from "@/components/ui/primitives";
import { AutomationCenter, type WorkflowRow, type ExecRow } from "./center";

export const metadata = { title: "Automation" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const orgId = org!.id;
  const [{ data: wfs }, { data: execs }, { data: stages }, members] = await Promise.all([
    supabase.from("automation_workflows").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
    supabase.from("automation_executions").select("id, workflow_id, status, error, started_at, finished_at, leads(name)").eq("organization_id", orgId).order("started_at", { ascending: false }).limit(50),
    supabase.from("pipeline_stages").select("name").eq("organization_id", orgId).order("position"),
    getMembers(supabase, orgId),
  ]);
  const stats = new Map<string, { ok: number; failed: number }>();
  for (const e of execs ?? []) { const s = stats.get(e.workflow_id) ?? { ok: 0, failed: 0 }; if (e.status === "succeeded") s.ok++; if (e.status === "failed") s.failed++; stats.set(e.workflow_id, s); }
  const names = new Map((wfs ?? []).map((w) => [w.id, w.name]));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Automation center" description="When something happens, check conditions, then run actions. Each event runs a workflow at most once." />
      <AutomationCenter
        canManage={["owner", "admin", "sales_manager"].includes(role ?? "")} emailReady={emailConfigured()}
        stages={(stages ?? []).map((s) => s.name)} members={members.map((m) => ({ id: m.user_id, name: m.name }))}
        workflows={(wfs ?? []).map((w): WorkflowRow => ({ id: w.id, name: w.name, description: w.description ?? "", triggerType: w.trigger_type, staleDays: (w.trigger_config as { days?: number })?.days, conditions: w.conditions, actions: w.actions, active: w.active, ok: stats.get(w.id)?.ok ?? 0, failed: stats.get(w.id)?.failed ?? 0 }))}
        executions={(execs ?? []).map((e): ExecRow => ({ id: e.id, workflow: names.get(e.workflow_id) ?? "Workflow", status: e.status, error: e.error, at: e.started_at, lead: (e.leads as unknown as { name: string } | null)?.name ?? null }))}
      />
    </div>
  );
}

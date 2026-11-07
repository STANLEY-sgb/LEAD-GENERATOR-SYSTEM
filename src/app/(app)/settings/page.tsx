import { getOrgContext } from "@/lib/org-context";
import { DEFAULT_CONFIG } from "@/lib/leads/scoring";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsPanels } from "./panels";

export const metadata = { title: "Settings" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const orgId = org!.id;
  const [{ data: sc }, { data: sup }, { data: audit }] = await Promise.all([
    supabase.from("scoring_configs").select("*").eq("organization_id", orgId).maybeSingle(),
    supabase.from("suppression_list").select("id, email_normalized, reason, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(100),
    ["owner", "admin"].includes(role ?? "") ? supabase.from("audit_logs").select("id, action, entity, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Organization settings" description={org!.name} />
      <SettingsPanels
        role={role!} orgName={org!.name}
        scoring={{ weights: sc?.weights ?? DEFAULT_CONFIG.weights, hot: sc?.hot_threshold ?? 75, warm: sc?.warm_threshold ?? 50, cold: sc?.cold_threshold ?? 25 }}
        suppression={sup ?? []} audit={audit ?? []}
      />
    </div>
  );
}

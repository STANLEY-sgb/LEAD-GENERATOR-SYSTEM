import { getOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/ui/primitives";
import { FormsManager } from "./manager";

export const metadata = { title: "Lead capture" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const { data } = await supabase.from("lead_forms").select("id, name, heading, public_key, consent_text, collect_phone, collect_company, active").eq("organization_id", org!.id).order("created_at", { ascending: false });
  const { count } = await supabase.from("lead_sources_history").select("id", { count: "exact", head: true }).eq("organization_id", org!.id).eq("source", "web_form");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Lead capture forms" description={`Consent-based forms that feed your CRM directly. ${count ?? 0} submission(s) so far.`} />
      <FormsManager forms={data ?? []} canManage={["owner", "admin", "sales_manager"].includes(role ?? "")} appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""} />
    </div>
  );
}

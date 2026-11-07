import { getOrgContext } from "@/lib/org-context";
import { aiProviderConfigured } from "@/lib/env";
import { IcpManager, type IcpRow } from "./manager";

export const metadata = { title: "Ideal customer profile" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const { data } = await supabase.from("ideal_customer_profiles").select("*").eq("organization_id", org!.id).order("created_at", { ascending: false });
  const rows: IcpRow[] = (data ?? []).map((r) => ({
    id: r.id, name: r.name, status: r.status as "draft" | "active", segments: r.segments, industries: r.industries,
    buyer_roles: r.buyer_roles, regions: r.regions, pain_points: r.pain_points, keywords: r.keywords, intent_signals: r.intent_signals,
  }));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ideal customer profile</h1>
        <p className="text-sm text-muted">AI suggestions are drafts. Targeting only activates after you approve it.</p>
      </div>
      <IcpManager rows={rows} canEdit={["owner", "admin", "sales_manager"].includes(role ?? "")} aiEnabled={aiProviderConfigured()} />
    </div>
  );
}

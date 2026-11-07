import { getOrgContext } from "@/lib/org-context";
import { BusinessProfileForm } from "./form";

export const metadata = { title: "Business profile" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const { data: bp } = await supabase.from("business_profiles").select("*").eq("organization_id", org!.id).maybeSingle();
  const canEdit = role === "owner" || role === "admin";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Business profile</h1>
        <p className="text-sm text-muted">The AI uses this to understand who your relevant prospects are.</p>
      </div>
      <BusinessProfileForm
        canEdit={canEdit}
        initial={{
          name: org!.name,
          businessEmail: bp?.business_email ?? "", phone: bp?.phone ?? "", website: bp?.website ?? "", location: bp?.location ?? "",
          industry: bp?.industry ?? "", description: bp?.description ?? "", orgSize: bp?.org_size ?? "",
          targetCountries: (bp?.target_countries ?? []).join(", "), preferredSources: (bp?.preferred_sources ?? []).join(", "),
        }}
      />
    </div>
  );
}

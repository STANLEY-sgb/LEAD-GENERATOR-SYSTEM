import { getMembers, getOrgContext } from "@/lib/org-context";
import { getLimits } from "@/lib/billing/entitlements";
import { PageHeader } from "@/components/ui/primitives";
import { TeamManager } from "./manager";

export const metadata = { title: "Team" };

export default async function Page() {
  const { supabase, org, role, userId } = await getOrgContext();
  const orgId = org!.id;
  const canManage = role === "owner" || role === "admin";
  const [members, { data: invites }, limits] = await Promise.all([
    getMembers(supabase, orgId),
    canManage ? supabase.from("organization_invitations").select("id, email, role, expires_at, accepted_at").eq("organization_id", orgId).is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    getLimits(orgId),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Team" description={`${members.length} of ${limits.limits.members} seats used on the ${limits.plan} plan.`} />
      <TeamManager members={members} invites={invites ?? []} me={userId} myRole={role!} canManage={canManage} />
    </div>
  );
}

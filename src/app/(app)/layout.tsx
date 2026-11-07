import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getOrgContext } from "@/lib/org-context";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org, role, userId } = await getOrgContext();
  if (!org || !role) redirect("/onboarding");
  if (org.status === "suspended") {
    return <div className="grid min-h-dvh place-items-center p-6 text-center"><p>This organization is suspended. Please contact support.</p></div>;
  }
  const { data: p } = await createAdminClient().from("profiles").select("is_super_admin").eq("id", userId).maybeSingle();
  return <AppShell orgName={org.name} role={role} isSuperAdmin={Boolean(p?.is_super_admin)}>{children}</AppShell>;
}

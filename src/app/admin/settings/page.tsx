import { requireSuperAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsEditor } from "./editor";

export default async function Page() {
  const { admin } = await requireSuperAdmin();
  const { data } = await admin.from("platform_settings").select("key, value").order("key");
  return (
    <>
      <PageHeader title="Platform settings" description="Key/value JSON settings (e.g. maintenance_mode, signup_enabled). Every change is audited." />
      <SettingsEditor rows={(data ?? []).map((s) => ({ key: s.key, value: JSON.stringify(s.value) }))} />
    </>
  );
}

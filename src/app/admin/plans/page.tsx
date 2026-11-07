import { requireSuperAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/ui/primitives";
import { PlanEditor } from "./editor";

export default async function Page() {
  const { admin } = await requireSuperAdmin();
  const { data: plans } = await admin.from("plans").select("id, name, price_cents, limits, stripe_price_id").order("sort");
  return (
    <>
      <PageHeader title="Plans & limits" description="Limits are enforced server-side on every metered action. Changes apply immediately to all organizations on the plan." />
      <PlanEditor plans={(plans ?? []).map((p) => ({ id: p.id, name: p.name, price: p.price_cents, stripe: p.stripe_price_id ?? "", limits: JSON.stringify(p.limits, null, 2) }))} />
    </>
  );
}

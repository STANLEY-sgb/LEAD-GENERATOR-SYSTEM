import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

const FALLBACK = [
  { id: "starter", name: "Starter", price_cents: 0, features: ["Basic lead discovery", "Basic CRM"], limits: { leads_per_month: 100 } },
  { id: "growth", name: "Growth", price_cents: 4900, features: ["AI lead qualification", "Advanced analytics"], limits: { leads_per_month: 1000 } },
  { id: "professional", name: "Professional", price_cents: 14900, features: ["Advanced automation", "Campaigns"], limits: { leads_per_month: 10000 } },
  { id: "enterprise", name: "Enterprise", price_cents: 0, features: ["Custom limits", "Priority support"], limits: { leads_per_month: 1000000 } },
];

async function load() {
  try {
    const { data } = await createAdminClient().from("plans").select("id, name, price_cents, features, limits").eq("active", true).order("sort");
    return data?.length ? data : FALLBACK;
  } catch {
    return FALLBACK; // Supabase not configured yet
  }
}

export default async function Page() {
  const plans = await load();
  return (
    <>
      <h1 className="text-3xl font-bold">Simple, usage-based plans</h1>
      <p className="mt-2 text-muted">Limits are enforced on the server. Upgrade any time from your billing page.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => (
          <div key={p.id} className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">{p.name}</h2>
            <p className="mt-2 text-3xl font-bold">{p.id === "enterprise" ? "Custom" : p.price_cents === 0 ? "Free" : `$${p.price_cents / 100}`}<span className="text-sm font-normal text-muted">{p.price_cents ? "/mo" : ""}</span></p>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-muted"><li>• {(p.limits as Record<string, number>).leads_per_month?.toLocaleString()} leads / month</li>{(p.features as string[]).map((f) => <li key={f}>• {f}</li>)}</ul>
            <Link href={p.id === "enterprise" ? "/contact" : "/register"} className="mt-4 rounded-lg bg-navy px-3 py-2 text-center text-sm font-semibold text-white">{p.id === "enterprise" ? "Contact sales" : "Get started"}</Link>
          </div>
        ))}
      </div>
    </>
  );
}

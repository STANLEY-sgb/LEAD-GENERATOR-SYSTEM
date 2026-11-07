import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicLeadForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get in touch", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { data: form } = await createAdminClient()
    .from("lead_forms").select("name, heading, consent_text, collect_phone, collect_company, active, organizations(name, status)")
    .eq("public_key", key).maybeSingle();
  const org = form?.organizations as unknown as { name: string; status: string } | null;
  if (!form || !form.active || org?.status !== "active") notFound();
  return (
    <main className="mx-auto grid min-h-dvh max-w-lg place-items-center p-4">
      <div className="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted">{org?.name}</p>
        <h1 className="mb-4 text-2xl font-bold">{form.heading || form.name}</h1>
        <PublicLeadForm formKey={key} consentText={form.consent_text} phone={form.collect_phone} company={form.collect_company} />
        <p className="mt-4 text-xs text-muted">Your details are sent to {org?.name} and used only to respond to your enquiry.</p>
      </div>
    </main>
  );
}

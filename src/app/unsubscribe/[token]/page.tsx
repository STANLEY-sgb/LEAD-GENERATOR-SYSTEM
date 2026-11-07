import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function unsubscribe(token: string): Promise<boolean> {
  let payload: string | null = null;
  try { payload = verifyToken(token); } catch { return false; }
  const [orgId, leadId] = (payload ?? "").split(":");
  if (!orgId || !leadId) return false;
  const admin = createAdminClient();
  const { data: lead } = await admin.from("leads").select("email_normalized, phone_normalized").eq("id", leadId).eq("organization_id", orgId).maybeSingle();
  if (!lead) return false;
  if (lead.email_normalized) await admin.from("suppression_list").upsert({ organization_id: orgId, email_normalized: lead.email_normalized, reason: "unsubscribed" }, { onConflict: "organization_id,email_normalized", ignoreDuplicates: true });
  await admin.from("leads").update({ consent_status: "withdrawn" }).eq("id", leadId).eq("organization_id", orgId);
  await admin.from("lead_activities").insert({ organization_id: orgId, lead_id: leadId, type: "unsubscribed", body: "Contact unsubscribed via link" });
  return true;
}

// Unsubscribe happens on page load per CAN-SPAM/GDPR one-click expectations; it is idempotent.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await unsubscribe(token);
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <p>{ok ? "You have been unsubscribed and will not receive further messages." : "This unsubscribe link is invalid or has expired."}</p>
    </main>
  );
}

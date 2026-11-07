import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvite } from "./accept";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join team", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold">Join your team</h1>
        <p className="text-sm text-muted">Signed in as {String(data.claims.email ?? "your account")}. The invitation must have been issued to this e-mail address.</p>
        <AcceptInvite token={token} />
      </div>
    </main>
  );
}

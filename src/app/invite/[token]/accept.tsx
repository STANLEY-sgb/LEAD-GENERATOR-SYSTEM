"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/primitives";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button className="w-full" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        const { error } = await createClient().rpc("accept_invitation", { p_token: token }); // validated + atomic in the database
        setBusy(false);
        if (error) return setError(error.message);
        router.replace("/dashboard"); router.refresh();
      }}>{busy ? "Joining…" : "Accept invitation"}</Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </>
  );
}

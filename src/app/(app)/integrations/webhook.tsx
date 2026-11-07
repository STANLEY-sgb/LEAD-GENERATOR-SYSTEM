"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { revokeWebhook, rotateWebhookSecret } from "@/lib/actions/platform";
import { Badge, Button, Card } from "@/components/ui/primitives";

export function WebhookPanel({ canManage, connected, encryptionReady }: { canManage: boolean; connected: boolean; encryptionReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, setShown] = useState<{ secret: string; url: string } | null>(null);
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Inbound webhook</h2><Badge tone={connected ? "success" : "neutral"}>{connected ? "Active" : "No secret issued"}</Badge></div>
      <p className="text-sm text-muted">POST JSON <code>{`{"leads":[{"name","email","phone","company","consent_granted"}]}`}</code> with header <code>x-leadpilot-signature</code> = hex HMAC-SHA256 of the raw body using your secret. Up to 100 leads per request.</p>
      {!encryptionReady && <p className="rounded-lg bg-accent/15 p-2 text-sm">Set <code>CREDENTIAL_ENCRYPTION_KEY</code> on the server to enable webhook secrets.</p>}
      {shown && <div className="space-y-1 rounded-lg bg-black/5 p-3 text-sm dark:bg-white/5"><p><b>URL:</b> <span className="break-all">{shown.url}</span></p><p><b>Secret (shown once):</b> <code className="break-all">{shown.secret}</code></p></div>}
      {canManage && encryptionReady && (
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => { if (connected && !confirm("Rotating invalidates the current secret. Continue?")) return; start(async () => { const r = await rotateWebhookSecret(); if (r.ok) { setShown(r.data!); router.refresh(); } else toast.error(r.error); }); }}>{connected ? "Rotate secret" : "Generate secret"}</Button>
          {connected && <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await revokeWebhook(); if (r.ok) { setShown(null); router.refresh(); } else toast.error(r.error); })}>Revoke</Button>}
        </div>
      )}
    </Card>
  );
}

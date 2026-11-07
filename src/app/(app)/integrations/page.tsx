import { CONNECTORS, PLANNED_INTEGRATIONS } from "@/lib/connectors";
import { aiProviderConfigured } from "@/lib/env";
import { emailConfigured } from "@/lib/email";
import { encryptionConfigured } from "@/lib/crypto";
import { stripeConfigured } from "@/lib/billing/stripe";
import { getOrgContext } from "@/lib/org-context";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { WebhookPanel } from "./webhook";

export const metadata = { title: "Integrations" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const { data: cred } = await supabase.from("integration_credentials").select("status, created_at").eq("organization_id", org!.id).eq("provider", "inbound_webhook").maybeSingle();
  const platform = [
    { name: "AI provider (OpenAI / Anthropic)", ok: aiProviderConfigured(), env: "OPENAI_API_KEY or ANTHROPIC_API_KEY", note: "ICP suggestions, AI briefs, assistant." },
    { name: "Email (Resend)", ok: emailConfigured(), env: "RESEND_API_KEY, EMAIL_FROM", note: "Notifications, invitations, consent-based automation e-mails." },
    { name: "Payments (Stripe)", ok: stripeConfigured(), env: "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET", note: "Subscriptions and invoices." },
    { name: "Credential encryption", ok: encryptionConfigured(), env: "CREDENTIAL_ENCRYPTION_KEY", note: "Required for webhook secrets and unsubscribe links." },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Integrations" description="Only integrations that are implemented and configured are shown as connected. Status is checked live on the server." />
      <div className="grid gap-4 md:grid-cols-2">
        {CONNECTORS.map((c) => (
          <Card key={c.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{c.name}</h2><Badge tone={c.configured() ? "success" : "warning"}>{c.configured() ? "Ready" : "Not configured"}</Badge></div>
            <p className="text-sm text-muted">{c.description}</p>
            <p className="text-xs"><b>Setup:</b> {c.setup}</p>
            <p className="text-xs"><b>Data accessed:</b> {c.permissions.length ? c.permissions.join(", ") : "Only what you or your visitors submit"}</p>
            {c.requiredEnv.length > 0 && <p className="text-xs text-muted">Environment: <code>{c.requiredEnv.join(", ")}</code></p>}
          </Card>
        ))}
      </div>
      <WebhookPanel canManage={role === "owner" || role === "admin"} connected={cred?.status === "connected"} encryptionReady={encryptionConfigured()} />
      <section><h2 className="mb-2 font-semibold">Platform services</h2>
        <div className="grid gap-3 sm:grid-cols-2">{platform.map((p) => <Card key={p.name} className="space-y-1"><div className="flex items-center justify-between gap-2"><b className="text-sm">{p.name}</b><Badge tone={p.ok ? "success" : "warning"}>{p.ok ? "Configured" : "Not configured"}</Badge></div><p className="text-xs text-muted">{p.note}</p>{!p.ok && <p className="text-xs">Set <code>{p.env}</code></p>}</Card>)}</div>
      </section>
      <section><h2 className="mb-2 font-semibold">Not yet available</h2>
        <div className="grid gap-3 sm:grid-cols-2">{[...PLANNED_INTEGRATIONS, { id: "sms", name: "SMS", note: "Requires a provider (e.g. Twilio) and per-country sender registration. Not implemented." }].map((p) => <Card key={p.id}><div className="flex items-center justify-between"><b className="text-sm">{p.name}</b><Badge>Not connected</Badge></div><p className="mt-1 text-xs text-muted">{p.note}</p></Card>)}</div>
      </section>
    </div>
  );
}

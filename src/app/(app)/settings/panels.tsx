"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addSuppression } from "@/lib/actions/leads";
import { saveScoringConfig } from "@/lib/actions/crm";
import { deleteOrganization } from "@/lib/actions/platform";
import { Button, Card, Input, Label } from "@/components/ui/primitives";

const W_LABEL: Record<string, string> = { relevance: "Product relevance", geography: "Geographic fit", industry: "Industry relevance", profile: "Customer profile match", intent: "Buying intent", completeness: "Contact completeness", recency: "Recency", source: "Source reliability" };

export function SettingsPanels({ role, orgName, scoring, suppression, audit }: { role: string; orgName: string; scoring: { weights: Record<string, number>; hot: number; warm: number; cold: number }; suppression: { id: string; email_normalized: string | null; reason: string | null; created_at: string }[]; audit: { id: string; action: string; entity: string | null; created_at: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [w, setW] = useState(scoring.weights);
  const [t, setT] = useState({ hot: scoring.hot, warm: scoring.warm, cold: scoring.cold });
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const canScore = ["owner", "admin", "sales_manager"].includes(role);
  const total = Object.values(w).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <h2 className="font-semibold">Scoring weights</h2>
        <p className="text-sm text-muted">Relative importance of each factor (normalized to 100). Apply to new leads; use “Re-score” on the Leads page for existing ones.</p>
        <div className="grid gap-3 sm:grid-cols-2">{Object.keys(W_LABEL).map((k) => <div key={k}><Label htmlFor={`w-${k}`}>{W_LABEL[k]} <span className="text-muted">({total ? Math.round((w[k] / total) * 100) : 0}%)</span></Label><Input id={`w-${k}`} type="number" min={0} max={100} disabled={!canScore} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} /></div>)}</div>
        <div className="grid grid-cols-3 gap-3">{(["hot", "warm", "cold"] as const).map((k) => <div key={k}><Label htmlFor={`t-${k}`}>{k[0].toUpperCase() + k.slice(1)} from score</Label><Input id={`t-${k}`} type="number" min={0} max={100} disabled={!canScore} value={t[k]} onChange={(e) => setT({ ...t, [k]: Number(e.target.value) })} /></div>)}</div>
        {canScore && <Button disabled={pending} onClick={() => start(async () => { const r = await saveScoringConfig({ weights: w as never, ...t }); if (r.ok) toast.success("Scoring updated"); else toast.error(r.error); })}>Save scoring</Button>}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Do-not-contact list</h2>
        <p className="text-sm text-muted">Suppressed addresses are never stored from new submissions, imports or discovery, and can never receive automated e-mail. Unsubscribe links add entries automatically.</p>
        {role !== "analyst" && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addSuppression(email); if (r.ok) { setEmail(""); toast.success("Added"); router.refresh(); } else toast.error(r.error); }); }}><Input aria-label="E-mail to suppress" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /><Button type="submit" variant="outline" disabled={pending || !email}>Add</Button></form>}
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">{suppression.map((s) => <li key={s.id} className="flex justify-between"><span>{s.email_normalized}</span><span className="text-muted">{s.reason}</span></li>)}{suppression.length === 0 && <li className="text-muted">Empty</li>}</ul>
      </Card>

      {["owner", "admin"].includes(role) && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Data &amp; privacy</h2>
          <p className="text-sm text-muted">Export everything your organization holds (leads, notes, activity, consent records, configuration) as JSON.</p>
          <a className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold" href="/api/org/export">Export organization data</a>
          {audit.length > 0 && <details className="pt-2 text-sm"><summary className="cursor-pointer">Recent audit log</summary><ul className="mt-2 space-y-1">{audit.map((a) => <li key={a.id} className="flex justify-between"><span>{a.action}</span><span className="text-muted">{new Date(a.created_at).toLocaleString()}</span></li>)}</ul></details>}
        </Card>
      )}

      {role === "owner" && (
        <Card className="space-y-2 border-red-300">
          <h2 className="font-semibold text-red-600">Delete organization</h2>
          <p className="text-sm text-muted">Permanently deletes all leads, contacts, workflows and members. Export your data first. Type <b>{orgName}</b> to confirm.</p>
          <div className="flex gap-2"><Input aria-label="Confirm organization name" value={confirm} onChange={(e) => setConfirm(e.target.value)} /><Button variant="danger" disabled={pending || confirm !== orgName} onClick={() => start(async () => { const r = await deleteOrganization(confirm); if (r.ok) { router.replace("/onboarding"); router.refresh(); } else toast.error(r.error); })}>Delete</Button></div>
        </Card>
      )}
    </div>
  );
}

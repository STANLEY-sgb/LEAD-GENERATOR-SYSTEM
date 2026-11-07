"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setOrgOverrides, setOrgPlan, setOrgStatus } from "@/lib/actions/admin";
import { Badge, Button, Card } from "@/components/ui/primitives";

type R = { id: string; name: string; slug: string; status: string; plan: string; subStatus: string; overrides: string; leads: number; members: number; created: string };

export function OrgTable({ rows, plans }: { rows: R[]; plans: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const done = (r: { ok: boolean; error?: string }, m: string) => { if (r.ok) { toast.success(m); router.refresh(); } else toast.error(r.error ?? "Failed"); };
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted"><tr><th className="p-3">Organization</th><th className="p-3">Status</th><th className="p-3">Plan</th><th className="p-3">Leads</th><th className="p-3">Members</th><th className="p-3">Created</th><th className="p-3">Actions</th></tr></thead>
        <tbody>{rows.map((o) => (
          <tr key={o.id} className="border-b border-border last:border-0">
            <td className="p-3"><b>{o.name}</b><br /><span className="text-xs text-muted">{o.slug}</span></td>
            <td className="p-3"><Badge tone={o.status === "active" ? "success" : "warning"}>{o.status}</Badge></td>
            <td className="p-3"><select aria-label={`Plan for ${o.name}`} className="min-h-9 rounded border border-border bg-card px-1" value={o.plan} disabled={pending} onChange={(e) => start(async () => done(await setOrgPlan(o.id, e.target.value), "Plan changed"))}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
            <td className="p-3">{o.leads}</td><td className="p-3">{o.members}</td><td className="whitespace-nowrap p-3 text-muted">{new Date(o.created).toLocaleDateString()}</td>
            <td className="space-x-1 whitespace-nowrap p-3">
              <Button variant={o.status === "active" ? "danger" : "primary"} className="min-h-9" disabled={pending} onClick={() => { if (confirm(`${o.status === "active" ? "Suspend" : "Reactivate"} ${o.name}?`)) start(async () => done(await setOrgStatus(o.id, o.status === "active" ? "suspended" : "active"), "Status updated")); }}>{o.status === "active" ? "Suspend" : "Reactivate"}</Button>
              <Button variant="outline" className="min-h-9" disabled={pending} onClick={() => { const v = prompt('Limit overrides as JSON, e.g. {"leads_per_month": 5000}', o.overrides); if (v !== null) start(async () => done(await setOrgOverrides(o.id, v), "Overrides saved")); }}>Limits</Button>
            </td>
          </tr>))}</tbody>
      </table>
    </Card>
  );
}

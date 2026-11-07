"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveCampaign, setCampaignStatus } from "@/lib/actions/platform";
import { Badge, Button, Card, EmptyState, Input, Label, Textarea } from "@/components/ui/primitives";

export type CampaignRow = {
  id: string; name: string; description: string; targetAudience: string; markets: string; keywords: string; sources: string; minScore: number; startsAt: string; endsAt: string;
  dailyLimit: number; spend: string; status: string; stats: { leads: number; qualified: number; converted: number; rate: number; cpl: number | null; bySource: Record<string, number> };
};

function CampaignForm({ initial, onDone }: { initial: CampaignRow | null; onDone: () => void }) {
  const [pending, start] = useTransition();
  const d = initial;
  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget); const g = (k: string) => String(f.get(k) ?? "");
        start(async () => {
          const r = await saveCampaign({ id: d?.id, name: g("name"), description: g("description"), targetAudience: g("audience"), markets: g("markets"), keywords: g("keywords"), sources: g("sources"), minScore: Number(g("minScore") || 0), startsAt: g("startsAt"), endsAt: g("endsAt"), dailyLimit: Number(g("dailyLimit") || 50), spend: g("spend") });
          if (r.ok) { toast.success("Campaign saved"); onDone(); } else toast.error(r.error);
        });
      }}>
        <div className="sm:col-span-2"><Label htmlFor="c-name">Name</Label><Input id="c-name" name="name" required defaultValue={d?.name} /></div>
        <div className="sm:col-span-2"><Label htmlFor="c-desc">Description</Label><Textarea id="c-desc" name="description" defaultValue={d?.description} /></div>
        <div><Label htmlFor="c-aud">Target audience</Label><Input id="c-aud" name="audience" defaultValue={d?.targetAudience} /></div>
        <div><Label htmlFor="c-mk">Markets (comma separated)</Label><Input id="c-mk" name="markets" defaultValue={d?.markets} /></div>
        <div><Label htmlFor="c-kw">Keywords (comma separated)</Label><Input id="c-kw" name="keywords" defaultValue={d?.keywords} /></div>
        <div><Label htmlFor="c-src">Lead sources (comma separated)</Label><Input id="c-src" name="sources" defaultValue={d?.sources} placeholder="google_places, web_form" /></div>
        <div><Label htmlFor="c-ms">Minimum qualifying score</Label><Input id="c-ms" name="minScore" type="number" min={0} max={100} defaultValue={d?.minScore ?? 0} /></div>
        <div><Label htmlFor="c-dl">Daily discovery limit</Label><Input id="c-dl" name="dailyLimit" type="number" min={1} defaultValue={d?.dailyLimit ?? 50} /></div>
        <div><Label htmlFor="c-s">Start date</Label><Input id="c-s" name="startsAt" type="date" defaultValue={d?.startsAt} /></div>
        <div><Label htmlFor="c-e">End date</Label><Input id="c-e" name="endsAt" type="date" defaultValue={d?.endsAt} /></div>
        <div><Label htmlFor="c-sp">Spend to date (optional, for cost-per-lead)</Label><Input id="c-sp" name="spend" inputMode="decimal" defaultValue={d?.spend} /></div>
        <div className="flex items-end gap-2 sm:col-span-2"><Button type="submit" disabled={pending}>Save campaign</Button><Button type="button" variant="outline" onClick={onDone}>Cancel</Button></div>
      </form>
    </Card>
  );
}

export function CampaignManager({ rows, canManage }: { rows: CampaignRow[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CampaignRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const status = (id: string, s: "active" | "paused" | "stopped") => start(async () => { const r = await setCampaignStatus(id, s); if (r.ok) router.refresh(); else toast.error(r.error); });

  if (editing) return <CampaignForm initial={editing === "new" ? null : editing} onDone={() => { setEditing(null); router.refresh(); }} />;
  return (
    <div className="space-y-4">
      {canManage && <Button onClick={() => setEditing("new")}>New campaign</Button>}
      {rows.length === 0 ? <EmptyState title="No campaigns yet" body="Create a campaign, activate it, then attribute discovery runs to it to see per-campaign results." /> : rows.map((c) => (
        <Card key={c.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><h2 className="font-semibold">{c.name}</h2><Badge tone={c.status === "active" ? "success" : c.status === "paused" ? "warning" : "neutral"}>{c.status}</Badge></div>
            {canManage && (
              <div className="flex gap-1">
                {c.status !== "active" && c.status !== "stopped" && <Button disabled={pending} onClick={() => status(c.id, "active")}>{c.status === "paused" ? "Resume" : "Start"}</Button>}
                {c.status === "active" && <Button variant="outline" disabled={pending} onClick={() => status(c.id, "paused")}>Pause</Button>}
                {c.status !== "stopped" && <Button variant="ghost" disabled={pending} onClick={() => { if (confirm("Stop this campaign permanently?")) status(c.id, "stopped"); }}>Stop</Button>}
                <Button variant="outline" onClick={() => setEditing(c)}>Edit</Button>
              </div>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[["Leads", c.stats.leads], ["Qualified", c.stats.qualified], ["Converted", c.stats.converted], ["Conversion", `${c.stats.rate}%`], ["Cost / lead", c.stats.cpl != null ? c.stats.cpl.toLocaleString() : "n/a"]].map(([k, v]) => <div key={String(k)}><dt className="text-xs uppercase text-muted">{k}</dt><dd className="text-xl font-bold">{v}</dd></div>)}
          </dl>
          {Object.keys(c.stats.bySource).length > 0 && <p className="text-xs text-muted">By source: {Object.entries(c.stats.bySource).map(([s, n]) => `${s} ${n}`).join(" · ")}</p>}
        </Card>
      ))}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startDiscovery } from "@/lib/actions/platform";
import { Badge, Button, Card, Input, Label } from "@/components/ui/primitives";

type C = { id: string; name: string; configured: boolean; setup: string; required: string[] };

export function DiscoveryForm({ connectors, campaigns, suggested, canRun }: { connectors: C[]; campaigns: { id: string; name: string }[]; suggested: string; canRun: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const connector = connectors[0]?.id ?? "";
  const [keywords, setKeywords] = useState(suggested);
  const [location, setLocation] = useState("");
  const [limit, setLimit] = useState(10);
  const [campaignId, setCampaignId] = useState("");
  const c = connectors.find((x) => x.id === connector);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">New discovery run</h2>
        {connectors.map((x) => <Badge key={x.id} tone={x.configured ? "success" : "warning"}>{x.name}: {x.configured ? "ready" : "not configured"}</Badge>)}
      </div>
      {c && !c.configured && (
        <p className="rounded-lg bg-accent/15 p-3 text-sm"><b>{c.name} isn&apos;t configured.</b> {c.setup} Required variable(s): <code>{c.required.join(", ")}</code>.</p>
      )}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await startDiscovery({ connector, keywords, location, limit, campaignId: campaignId || null });
          if (r.ok) { toast.success("Discovery started. Results appear in Leads as they are processed."); router.refresh(); } else toast.error(r.error);
        });
      }}>
        <div><Label htmlFor="d-keywords">Keywords</Label><Input id="d-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. solar installers" required /></div>
        <div><Label htmlFor="d-loc">Location</Label><Input id="d-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Kampala, Uganda" /></div>
        <div><Label htmlFor="d-limit">Max results (1–20)</Label><Input id="d-limit" type="number" min={1} max={20} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></div>
        <div><Label htmlFor="d-camp">Attribute to campaign</Label><select id="d-camp" className="min-h-10 w-full rounded-lg border border-border bg-card px-2 text-sm" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">None</option>{campaigns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="sm:col-span-2"><Button type="submit" disabled={pending || !canRun || !c?.configured}>{pending ? "Starting…" : "Start discovery"}</Button>{!canRun && <span className="ml-3 text-sm text-muted">Managers and above can run discovery.</span>}</div>
      </form>
      <p className="text-xs text-muted">Uses official APIs only. Business listings return public business data; no private individuals are profiled and no e-mail addresses are guessed.</p>
    </Card>
  );
}

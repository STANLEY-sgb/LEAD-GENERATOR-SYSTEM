"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveSetting } from "@/lib/actions/admin";
import { Button, Card, Input, Label } from "@/components/ui/primitives";

export function SettingsEditor({ rows }: { rows: { key: string; value: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [k, setK] = useState(""); const [v, setV] = useState("true");
  const save = (key: string, value: string) => start(async () => { const r = await saveSetting(key, value); if (r.ok) { toast.success("Saved"); setK(""); router.refresh(); } else toast.error(r.error); });
  return (
    <div className="space-y-4">
      <Card><form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save(k, v); }}>
        <div><Label htmlFor="s-key">Key</Label><Input id="s-key" value={k} onChange={(e) => setK(e.target.value)} placeholder="maintenance_mode" /></div>
        <div><Label htmlFor="s-val">Value (JSON)</Label><Input id="s-val" value={v} onChange={(e) => setV(e.target.value)} /></div>
        <Button type="submit" disabled={pending || !k}>Save</Button></form></Card>
      <Card className="divide-y divide-border p-0">{rows.length === 0 && <p className="p-4 text-sm text-muted">No settings yet.</p>}{rows.map((r) => <div key={r.key} className="flex items-center justify-between gap-2 p-3 text-sm"><b>{r.key}</b><code className="min-w-0 truncate">{r.value}</code><Button variant="outline" onClick={() => { setK(r.key); setV(r.value); }}>Edit</Button></div>)}</Card>
    </div>
  );
}

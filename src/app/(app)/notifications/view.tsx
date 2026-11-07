"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markNotificationsRead, savePreferences } from "@/lib/actions/platform";
import { Button, Card } from "@/components/ui/primitives";

type N = { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };
type P = { in_app: boolean; email: boolean; sms: boolean; high_priority_leads: boolean; automation_failures: boolean };

export function NotificationsView({ items, prefs, emailReady }: { items: N[]; prefs: P; emailReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [p, setP] = useState(prefs);
  const toggle = (k: keyof P) => setP({ ...p, [k]: !p[k] });
  const unread = items.filter((i) => !i.read_at).length;

  return (
    <>
      <Card className="space-y-2">
        <h2 className="font-semibold">Preferences</h2>
        {([["in_app", "In-app notifications"], ["email", "E-mail notifications"], ["high_priority_leads", "Hot lead alerts"], ["automation_failures", "Automation failure alerts"]] as [keyof P, string][]).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p[k]} onChange={() => toggle(k)} /> {label}{k === "email" && !emailReady && <span className="text-xs text-muted">(e-mail not configured on this deployment)</span>}</label>
        ))}
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" disabled /> SMS notifications (not available: no SMS provider connected)</label>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await savePreferences(p); if (r.ok) toast.success("Preferences saved"); else toast.error(r.error); })}>Save preferences</Button>
      </Card>
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Inbox {unread > 0 && `(${unread} unread)`}</h2>{unread > 0 && <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })}>Mark all read</Button>}</div>
          <Card className="divide-y divide-border p-0">
            {items.map((n) => (
              <div key={n.id} className={`flex items-start justify-between gap-3 p-3 text-sm ${n.read_at ? "opacity-70" : ""}`}>
                <div className="min-w-0">{!n.read_at && <span className="mr-2 inline-block size-2 rounded-full bg-accent" aria-label="unread" />}<b>{n.title}</b>{n.body && <p className="line-clamp-2 text-muted">{n.body}</p>}{n.link && <Link className="text-xs underline" href={n.link} onClick={() => { void markNotificationsRead([n.id]); }}>Open</Link>}</div>
                <span className="shrink-0 text-xs text-muted">{new Date(n.created_at).toLocaleString()}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTask, setTaskDone } from "@/lib/actions/crm";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";

export function TaskRow({ t, canWrite }: { t: { id: string; title: string; type: string; due: string; lead: string | null; leadId: string | null; who: string; overdue: boolean }; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3 p-3 text-sm">
      <input type="checkbox" className="size-5" disabled={!canWrite || pending} aria-label={`Complete ${t.title}`} onChange={() => start(async () => { const r = await setTaskDone(t.id, true); if (r.ok) router.refresh(); else toast.error(r.error); })} />
      <div className="min-w-0 flex-1"><p className="truncate font-medium">{t.title}</p><p className="truncate text-xs text-muted">{t.lead && t.leadId ? <Link className="underline" href={`/leads/${t.leadId}`}>{t.lead}</Link> : "No lead"} · {t.who}</p></div>
      <Badge className="capitalize">{t.type.replace("_", " ")}</Badge>
      <span className={`whitespace-nowrap text-xs ${t.overdue ? "font-semibold text-red-600" : "text-muted"}`}>{new Date(t.due).toLocaleString()}</span>
    </div>
  );
}

export function TaskList({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ title: "", type: "follow_up" as "call" | "email" | "meeting" | "follow_up" | "review", due: "" });
  if (!canWrite) return null;
  return (
    <Card>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createTask({ title: v.title, type: v.type, dueAt: v.due }); if (r.ok) { setV({ ...v, title: "" }); router.refresh(); toast.success("Task added"); } else toast.error(r.error); }); }}>
        <Input aria-label="Task title" className="min-w-0 flex-1 basis-48" placeholder="New task…" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <select aria-label="Type" className="min-h-10 rounded-lg border border-border bg-card px-2 text-sm" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as typeof v.type })}>{["call", "email", "meeting", "follow_up", "review"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select>
        <Input aria-label="Due" type="datetime-local" className="w-auto" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} />
        <Button type="submit" disabled={pending || !v.title.trim() || !v.due}>Add</Button>
      </form>
    </Card>
  );
}

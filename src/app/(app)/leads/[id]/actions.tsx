"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addNote, archiveLeads, assignLead, changeStage, logCommunication, setTag, summarizeLead, updateLead } from "@/lib/actions/leads";
import { createTask, setTaskDone } from "@/lib/actions/crm";
import { Button, Card, Input, Label, Textarea } from "@/components/ui/primitives";

interface Props {
  canWrite: boolean; aiEnabled: boolean;
  lead: { id: string; name: string; company: string; phone: string; website: string; country: string; industry: string; estValue: string; stageId: string | null; assignedTo: string | null };
  stages: { id: string; name: string; kind: string }[]; members: { id: string; name: string }[]; tags: string[];
  notes: { id: string; body: string; at: string; by: string }[];
  tasks: { id: string; title: string; type: string; due_at: string; completed_at: string | null }[];
}

export function LeadActions({ canWrite, aiEnabled, lead, stages, members, tags, notes, tasks }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [tag, setTagText] = useState("");
  const [comm, setComm] = useState<{ kind: "call" | "email_sent" | "meeting" | "contacted"; text: string }>({ kind: "call", text: "" });
  const [task, setTask] = useState({ title: "", type: "follow_up" as "call" | "email" | "meeting" | "follow_up" | "review", due: "" });

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string, after?: () => void) => start(async () => {
    const r = await fn();
    if (r.ok) { if (ok) toast.success(ok); after?.(); router.refresh(); } else toast.error(r.error ?? "Failed");
  });
  const sel = "min-h-10 rounded-lg border border-border bg-card px-2 text-sm";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="stage">Pipeline stage</Label>
            <select id="stage" disabled={!canWrite || pending} className={sel + " w-full"} value={lead.stageId ?? ""} onChange={(e) => {
              const st = stages.find((s) => s.id === e.target.value); let reason: string | undefined;
              if (st?.kind === "lost") { reason = prompt("Why was this lead lost?") ?? undefined; if (!reason) return; }
              run(() => changeStage(lead.id, e.target.value, reason), "Stage updated");
            }}>{!lead.stageId && <option value="">-</option>}{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><Label htmlFor="assignee">Assigned to</Label>
            <select id="assignee" disabled={!canWrite || pending} className={sel + " w-full"} value={lead.assignedTo ?? ""} onChange={(e) => run(() => assignLead(lead.id, e.target.value || null), "Assignment updated")}>
              <option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        </div>

        <div>
          <Label>Tags</Label>
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2.5 py-0.5 text-xs dark:bg-white/10">{t}{canWrite && <button aria-label={`Remove tag ${t}`} className="font-bold" onClick={() => run(() => setTag(lead.id, t, false))}>×</button>}</span>)}
            {canWrite && <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (tag.trim()) run(() => setTag(lead.id, tag, true), undefined, () => setTagText("")); }}><Input aria-label="New tag" value={tag} onChange={(e) => setTagText(e.target.value)} className="min-h-8 w-28 text-xs" placeholder="Add tag" /><Button type="submit" variant="outline" className="min-h-8 px-2 text-xs">Add</Button></form>}
          </div>
        </div>

        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(!editing)}>{editing ? "Close editor" : "Edit details"}</Button>
            <Button variant="outline" disabled={pending || !aiEnabled} title={aiEnabled ? "" : "AI is not configured"} onClick={() => run(() => summarizeLead(lead.id), "AI brief generated")}>Generate AI brief</Button>
            <Button variant="ghost" onClick={() => { if (confirm("Archive this lead?")) run(() => archiveLeads([lead.id]), "Archived", () => router.push("/leads")); }}>Archive</Button>
          </div>
        )}

        {editing && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
            e.preventDefault(); const f = new FormData(e.currentTarget); const g = (k: string) => String(f.get(k) ?? "");
            run(() => updateLead({ id: lead.id, name: g("name"), company: g("company"), phone: g("phone"), website: g("website"), country: g("country"), industry: g("industry"), estValue: g("estValue") }), "Saved", () => setEditing(false));
          }}>
            {(["name", "company", "phone", "website", "country", "industry", "estValue"] as const).map((k) => <div key={k}><Label htmlFor={`e-${k}`}>{k === "estValue" ? "Estimated value" : k[0].toUpperCase() + k.slice(1)}</Label><Input id={`e-${k}`} name={k} defaultValue={lead[k]} /></div>)}
            <div className="sm:col-span-2"><Button type="submit" disabled={pending}>Save changes</Button></div>
          </form>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="mb-2 font-semibold">Notes</h2>
          {canWrite && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addNote(lead.id, note), "Note added", () => setNote("")); }}><Textarea aria-label="New note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" /><Button type="submit" disabled={pending || !note.trim()}>Add</Button></form>}
          <ul className="mt-3 space-y-2 text-sm">{notes.map((n) => <li key={n.id} className="rounded-lg bg-black/5 p-2 dark:bg-white/5"><p className="whitespace-pre-wrap">{n.body}</p><p className="text-xs text-muted">{n.by} · <time suppressHydrationWarning>{new Date(n.at).toLocaleString()}</time></p></li>)}</ul>
        </div>

        {canWrite && (
          <div>
            <h2 className="mb-2 font-semibold">Log communication</h2>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => logCommunication(lead.id, comm.kind, comm.text), "Logged", () => setComm({ ...comm, text: "" })); }}>
              <select aria-label="Type" className={sel} value={comm.kind} onChange={(e) => setComm({ ...comm, kind: e.target.value as typeof comm.kind })}><option value="call">Call</option><option value="email_sent">Email</option><option value="meeting">Meeting</option><option value="contacted">Other contact</option></select>
              <Input aria-label="Summary" className="min-w-0 flex-1 basis-40" value={comm.text} onChange={(e) => setComm({ ...comm, text: e.target.value })} placeholder="What happened?" />
              <Button type="submit" variant="outline" disabled={pending || !comm.text.trim()}>Log</Button>
            </form>
          </div>
        )}

        <div>
          <h2 className="mb-2 font-semibold">Follow-ups</h2>
          {canWrite && (
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => createTask({ title: task.title, type: task.type, dueAt: task.due, leadId: lead.id, assignedTo: lead.assignedTo }), "Task scheduled", () => setTask({ ...task, title: "" })); }}>
              <Input aria-label="Task title" className="min-w-0 flex-1 basis-40" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="Call to discuss…" />
              <select aria-label="Task type" className={sel} value={task.type} onChange={(e) => setTask({ ...task, type: e.target.value as typeof task.type })}>{["call", "email", "meeting", "follow_up", "review"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select>
              <Input aria-label="Due" type="datetime-local" className="w-auto" value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} />
              <Button type="submit" variant="outline" disabled={pending || !task.title.trim() || !task.due}>Schedule</Button>
            </form>
          )}
          <ul className="mt-3 space-y-1 text-sm">{tasks.map((t) => <li key={t.id} className="flex items-center gap-2"><input type="checkbox" disabled={!canWrite} checked={!!t.completed_at} aria-label={`Complete ${t.title}`} onChange={(e) => run(() => setTaskDone(t.id, e.target.checked))} /><span className={t.completed_at ? "line-through text-muted" : ""}>{t.title}</span><span className="text-xs text-muted"><time suppressHydrationWarning>{new Date(t.due_at).toLocaleString()}</time></span></li>)}</ul>
        </div>
      </Card>
    </div>
  );
}

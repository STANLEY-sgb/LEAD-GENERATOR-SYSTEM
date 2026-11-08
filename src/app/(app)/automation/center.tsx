"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteWorkflow, retryFailedExecution, saveWorkflow, setWorkflowActive } from "@/lib/actions/automation";
import { Badge, Button, Card, EmptyState, Input, Label } from "@/components/ui/primitives";

type Cond = { field: string; op: string; value?: string | number };
type Act = Record<string, unknown> & { type: string };
export type WorkflowRow = { id: string; name: string; description: string; triggerType: string; staleDays?: number; conditions: Cond[]; actions: Act[]; active: boolean; ok: number; failed: number };
export type ExecRow = { id: string; workflow: string; status: string; error: string | null; at: string; lead: string | null };
type Draft = { id?: string; name: string; description: string; triggerType: string; staleDays?: number; conditions: Cond[]; actions: Act[] };

const TRIGGERS: Record<string, string> = { "lead.created": "A new lead is created", "lead.captured": "A lead submits a form / webhook", "lead.scored": "A lead is scored", "lead.stage_changed": "A lead changes pipeline stage", "lead.stale": "A new lead has not been touched for N days" };
const FIELDS = ["score", "qualification", "country", "industry", "source", "status", "stage", "consent_status", "has_email", "has_phone", "contacted", "tag"];
const OPS = [["eq", "equals"], ["neq", "not equals"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["contains", "contains"], ["is_true", "is true"], ["is_false", "is false"]];
const ACTION_LABEL: Record<string, string> = { add_tag: "Add tag", update_stage: "Move to stage", assign: "Assign lead", notify: "Notify managers", create_task: "Create follow-up task", ai_summary: "Generate AI brief", webhook: "Send webhook (HTTPS)", send_email: "Send e-mail (consent required)" };

const TEMPLATES: { label: string; draft: Draft }[] = [
  { label: "Alert managers to hot leads", draft: { name: "Hot lead alert", description: "", triggerType: "lead.scored", conditions: [{ field: "score", op: "gte", value: 75 }], actions: [{ type: "notify", title: "Hot lead: {{name}}", message: "Score is high. Follow up today." }, { type: "create_task", title: "Call {{name}}", task_type: "call", due_in_hours: 4 }] } },
  { label: "Tag and brief new form leads", draft: { name: "New enquiry triage", description: "", triggerType: "lead.captured", conditions: [], actions: [{ type: "add_tag", tag: "inbound" }, { type: "ai_summary" }, { type: "assign", user_id: "round_robin" }] } },
  { label: "Follow up on untouched leads", draft: { name: "Stale lead nudge", description: "", triggerType: "lead.stale", staleDays: 3, conditions: [{ field: "contacted", op: "is_false" }], actions: [{ type: "create_task", title: "Follow up with {{name}}", task_type: "follow_up", due_in_hours: 24 }] } },
];

export function AutomationCenter({ workflows, executions, canManage, stages, members, emailReady }: { workflows: WorkflowRow[]; executions: ExecRow[]; canManage: boolean; stages: string[]; members: { id: string; name: string }[]; emailReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const done = (r: { ok: boolean; error?: string }, ok: string) => { if (r.ok) { toast.success(ok); router.refresh(); } else toast.error(r.error ?? "Failed"); };
  const sel = "min-h-10 rounded-lg border border-border bg-card px-2 text-sm";

  const setAct = (i: number, patch: Partial<Act>) => setDraft((d) => d && { ...d, actions: d.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const newAct = (type: string): Act => ({ type, ...(type === "add_tag" ? { tag: "" } : type === "update_stage" ? { stage: stages[0] ?? "" } : type === "assign" ? { user_id: "round_robin" } : type === "notify" ? { title: "", message: "" } : type === "create_task" ? { title: "", task_type: "follow_up", due_in_hours: 24 } : type === "webhook" ? { url: "https://", secret: "" } : type === "send_email" ? { subject: "", body: "" } : {}) });

  if (draft) {
    return (
      <Card className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="w-name">Workflow name</Label><Input id="w-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div><Label htmlFor="w-trig">When…</Label><select id="w-trig" className={sel + " w-full"} value={draft.triggerType} onChange={(e) => setDraft({ ...draft, triggerType: e.target.value })}>{Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          {draft.triggerType === "lead.stale" && <div><Label htmlFor="w-days">Days untouched</Label><Input id="w-days" type="number" min={1} max={90} value={draft.staleDays ?? 3} onChange={(e) => setDraft({ ...draft, staleDays: Number(e.target.value) })} /></div>}
        </div>

        <section aria-label="Conditions" className="space-y-2">
          <h3 className="font-semibold">Only if (all must match)</h3>
          {draft.conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <select aria-label="Field" className={sel} value={c.field} onChange={(e) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>{FIELDS.map((f) => <option key={f} value={f}>{f.replace("_", " ")}</option>)}</select>
              <select aria-label="Operator" className={sel} value={c.op} onChange={(e) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })}>{OPS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {!["is_true", "is_false"].includes(c.op) && <Input aria-label="Value" className="w-40" value={c.value ?? ""} onChange={(e) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />}
              <Button variant="ghost" aria-label="Remove condition" onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })}>×</Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: "score", op: "gte", value: 50 }] })}>Add condition</Button>
        </section>

        <section aria-label="Actions" className="space-y-3">
          <h3 className="font-semibold">Then do (in order)</h3>
          {draft.actions.map((a, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2"><b className="text-sm">{i + 1}. {ACTION_LABEL[a.type]}</b><Button variant="ghost" aria-label="Remove action" onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}>×</Button></div>
              {a.type === "add_tag" && <Input aria-label="Tag" placeholder="Tag name" value={String(a.tag ?? "")} onChange={(e) => setAct(i, { tag: e.target.value })} />}
              {a.type === "update_stage" && <select aria-label="Stage" className={sel} value={String(a.stage)} onChange={(e) => setAct(i, { stage: e.target.value })}>{stages.map((s) => <option key={s}>{s}</option>)}</select>}
              {a.type === "assign" && <select aria-label="Assignee" className={sel} value={String(a.user_id)} onChange={(e) => setAct(i, { user_id: e.target.value })}><option value="round_robin">Round-robin (sales team)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
              {a.type === "notify" && <><Input aria-label="Title" placeholder="Title (use {{name}}, {{company}})" value={String(a.title ?? "")} onChange={(e) => setAct(i, { title: e.target.value })} /><Input aria-label="Message" placeholder="Message" value={String(a.message ?? "")} onChange={(e) => setAct(i, { message: e.target.value })} /></>}
              {a.type === "create_task" && <div className="flex flex-wrap gap-2"><Input aria-label="Task title" className="min-w-0 flex-1" placeholder="Task title" value={String(a.title ?? "")} onChange={(e) => setAct(i, { title: e.target.value })} /><select aria-label="Task type" className={sel} value={String(a.task_type)} onChange={(e) => setAct(i, { task_type: e.target.value })}>{["call", "email", "meeting", "follow_up", "review"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select><Input aria-label="Due in hours" type="number" className="w-28" min={1} value={Number(a.due_in_hours ?? 24)} onChange={(e) => setAct(i, { due_in_hours: Number(e.target.value) })} /></div>}
              {a.type === "webhook" && <><Input aria-label="URL" placeholder="https://example.com/hook" value={String(a.url ?? "")} onChange={(e) => setAct(i, { url: e.target.value })} /><Input aria-label="Signing secret" placeholder="Optional shared secret (HMAC-SHA256 signature)" value={String(a.secret ?? "")} onChange={(e) => setAct(i, { secret: e.target.value })} /></>}
              {a.type === "send_email" && <>
                {!emailReady && <p className="rounded bg-accent/15 p-2 text-xs">E-mail isn&apos;t configured (RESEND_API_KEY, EMAIL_FROM). This action will fail until it is.</p>}
                <Input aria-label="Subject" placeholder="Subject" value={String(a.subject ?? "")} onChange={(e) => setAct(i, { subject: e.target.value })} />
                <textarea aria-label="Body" rows={4} className="w-full rounded-lg border border-border bg-card p-2 text-sm" placeholder="Hi {{name}}, …" value={String(a.body ?? "")} onChange={(e) => setAct(i, { body: e.target.value })} />
                <p className="text-xs text-muted">Sent only to leads with recorded consent who are not suppressed. An unsubscribe link is added automatically. Capped at 50 per hour.</p></>}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">{Object.entries(ACTION_LABEL).map(([k, v]) => <Button key={k} variant="outline" className="text-xs" disabled={draft.actions.length >= 10} onClick={() => setDraft({ ...draft, actions: [...draft.actions, newAct(k)] })}>+ {v}</Button>)}</div>
        </section>

        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => start(async () => {
            const r = await saveWorkflow({ id: draft.id, name: draft.name, description: draft.description, triggerType: draft.triggerType as never, staleDays: draft.triggerType === "lead.stale" ? draft.staleDays ?? 3 : undefined, conditions: draft.conditions as never, actions: draft.actions as never });
            if (r.ok) { toast.success("Saved (inactive until you activate it)"); setDraft(null); router.refresh(); } else toast.error(r.error);
          })}>Save workflow</Button>
          <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDraft({ name: "", description: "", triggerType: "lead.created", conditions: [], actions: [] })}>New workflow</Button>
          {TEMPLATES.map((t) => <Button key={t.label} variant="outline" onClick={() => setDraft(structuredClone(t.draft))}>Template: {t.label}</Button>)}
        </div>
      )}
      {workflows.length === 0 ? <EmptyState title="No workflows yet" body="Start from a template or build your own. New workflows are saved inactive so you can review them first." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {workflows.map((w) => (
            <Card key={w.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate font-semibold">{w.name}</h2><p className="text-xs text-muted">{TRIGGERS[w.triggerType]}</p></div><Badge tone={w.active ? "success" : "neutral"}>{w.active ? "Active" : "Inactive"}</Badge></div>
              <p className="text-sm">{w.conditions.length} condition(s) → {w.actions.map((a) => ACTION_LABEL[a.type]).join(", ")}</p>
              <p className="text-xs text-muted">Recent runs: {w.ok} succeeded, {w.failed} failed</p>
              {canManage && <div className="flex flex-wrap gap-1">
                <Button variant={w.active ? "outline" : "primary"} disabled={pending} onClick={() => start(async () => done(await setWorkflowActive(w.id, !w.active), w.active ? "Deactivated" : "Activated"))}>{w.active ? "Deactivate" : "Activate"}</Button>
                <Button variant="outline" onClick={() => setDraft({ id: w.id, name: w.name, description: w.description, triggerType: w.triggerType, staleDays: w.staleDays, conditions: w.conditions, actions: w.actions })}>Edit</Button>
                <Button variant="ghost" disabled={pending} onClick={() => { if (confirm("Delete workflow and its history?")) start(async () => done(await deleteWorkflow(w.id), "Deleted")); }}>Delete</Button>
              </div>}
            </Card>
          ))}
        </div>
      )}
      <section>
        <h2 className="mb-2 font-semibold">Execution history</h2>
        {executions.length === 0 ? <p className="text-sm text-muted">No executions yet.</p> : (
          <Card className="divide-y divide-border p-0">
            {executions.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{e.workflow}{e.lead ? ` · ${e.lead}` : ""}</p>{e.error && <p className="text-xs text-red-600">{e.error}</p>}</div>
                <div className="flex items-center gap-2"><Badge tone={e.status === "succeeded" ? "success" : e.status === "failed" ? "warning" : "neutral"}>{e.status}</Badge><span className="text-xs text-muted"><time suppressHydrationWarning>{new Date(e.at).toLocaleString()}</time></span>
                  {canManage && e.status === "failed" && <Button variant="outline" className="min-h-8 text-xs" disabled={pending} onClick={() => start(async () => done(await retryFailedExecution(e.id), "Retried"))}>Retry</Button>}</div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

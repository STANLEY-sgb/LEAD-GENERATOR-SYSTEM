"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { approveIcp, deleteIcp, generateIcp, saveIcp, type IcpDraft } from "@/lib/actions/icp";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui/primitives";

export type IcpRow = IcpDraft & { id: string; name: string; status: "draft" | "active" };

const FIELDS: [keyof IcpDraft, string][] = [
  ["segments", "Customer segments"], ["industries", "Industries"], ["buyer_roles", "Buyer roles"], ["regions", "Markets"],
  ["pain_points", "Pain points"], ["keywords", "Search keywords"], ["intent_signals", "Buying-intent signals"],
];
const toText = (a: string[]) => a.join(", ");
const toArr = (s: string) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];

function Editor({ initial, onDone }: { initial: { id?: string; name: string; draft: IcpDraft }; onDone: () => void }) {
  const [name, setName] = useState(initial.name);
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(([k]) => [k, toText(initial.draft[k])])));
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const draft = Object.fromEntries(FIELDS.map(([k]) => [k, toArr(vals[k])])) as IcpDraft;
    const r = await saveIcp({ id: initial.id, name, ...draft });
    if (r.ok) { toast.success("Saved as draft. Review and approve to activate."); onDone(); } else toast.error(r.error);
  });
  return (
    <Card className="space-y-4">
      <div><Label htmlFor="icp-name">Profile name</Label><Input id="icp-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      {FIELDS.map(([k, label]) => (
        <div key={k}><Label htmlFor={k}>{label} <span className="text-muted">(comma separated)</span></Label>
          <Textarea id={k} value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></div>
      ))}
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending || name.trim().length < 2}>{pending ? "Saving…" : "Save as draft"}</Button>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}

export function IcpManager({ rows, canEdit, aiEnabled }: { rows: IcpRow[]; canEdit: boolean; aiEnabled: boolean }) {
  const [desc, setDesc] = useState("");
  const [editing, setEditing] = useState<{ id?: string; name: string; draft: IcpDraft } | null>(null);
  const [gen, startGen] = useTransition();
  const [pending, start] = useTransition();

  const generate = () => startGen(async () => {
    const r = await generateIcp(desc);
    if (r.ok && r.data) { setEditing({ name: "AI suggested profile", draft: r.data }); toast.info("Review the suggestion, edit it, then save."); }
    else if (!r.ok) toast.error(r.error);
  });

  if (editing) return <Editor key={editing.id ?? "new"} initial={editing} onDone={() => setEditing(null)} />;

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold"><Sparkles size={18} className="text-accent" /> Generate with AI</h2>
          <Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe your product or service in ordinary language…" />
          {!aiEnabled && <p className="text-sm text-muted">AI isn&apos;t configured on this deployment yet, so generation is unavailable. You can still create a profile by hand.</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={generate} disabled={gen || !aiEnabled || desc.trim().length < 20}>{gen ? "Thinking…" : "Suggest profile"}</Button>
            <Button variant="outline" onClick={() => setEditing({ name: "", draft: { segments: [], industries: [], buyer_roles: [], regions: [], pain_points: [], keywords: [], intent_signals: [] } })}>Create manually</Button>
          </div>
        </Card>
      )}
      {rows.length === 0 ? (
        <Card className="text-center"><p className="font-semibold">No ideal customer profiles yet</p><p className="text-sm text-muted">Create one to guide lead discovery.</p></Card>
      ) : rows.map((r) => (
        <Card key={r.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><h2 className="font-semibold">{r.name}</h2><Badge tone={r.status === "active" ? "success" : "warning"}>{r.status === "active" ? "Active" : "Draft: needs approval"}</Badge></div>
            {canEdit && (
              <div className="flex gap-1">
                {r.status === "draft" && <Button disabled={pending} onClick={() => start(async () => { const x = await approveIcp(r.id); { if (x.ok) toast.success("Profile approved and active"); else toast.error(x.error); }; })}><CheckCircle2 size={16} /> Approve</Button>}
                <Button variant="outline" onClick={() => setEditing({ id: r.id, name: r.name, draft: r })}>Edit</Button>
                <Button variant="ghost" aria-label="Delete profile" disabled={pending} onClick={() => { if (confirm("Delete this profile?")) start(async () => { const x = await deleteIcp(r.id); { if (x.ok) toast.success("Deleted"); else toast.error(x.error); }; }); }}><Trash2 size={16} /></Button>
              </div>
            )}
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {FIELDS.map(([k, label]) => r[k].length > 0 && (
              <div key={k}><dt className="text-xs font-semibold uppercase text-muted">{label}</dt><dd>{toText(r[k])}</dd></div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Columns3 } from "lucide-react";
import { toast } from "sonner";
import { archiveLeads, bulkAssign, bulkTag, rescoreLeads } from "@/lib/actions/leads";
import { Button, Card, EmptyState, QualBadge } from "@/components/ui/primitives";

export type LeadRow = {
  id: string; name: string; company: string | null; email: string | null; phone: string | null; country: string | null; industry: string | null;
  source: string; score: number | null; qualification: string; status: string; assigned_to: string | null; assignee: string | null; created_at: string; consent_status: string;
};
const COLS = [
  { key: "company", label: "Company" }, { key: "contact", label: "Contact" }, { key: "country", label: "Country" }, { key: "source", label: "Source" },
  { key: "score", label: "Score" }, { key: "status", label: "Status" }, { key: "assignee", label: "Assigned" }, { key: "created", label: "Added" },
] as const;
type ColKey = (typeof COLS)[number]["key"];

export function LeadsTable({ rows, members, canWrite }: { rows: LeadRow[]; members: { id: string; name: string }[]; canWrite: boolean }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState<Set<ColKey>>(new Set(COLS.map((c) => c.key)));
  const [showCols, setShowCols] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => { // column preference is a per-browser convenience; applied after hydration to avoid a mismatch
    queueMicrotask(() => { try { const v = localStorage.getItem("leads.cols"); if (v) setVisible(new Set(JSON.parse(v))); } catch { /* ignore */ } });
  }, []);
  const toggleCol = (k: ColKey) => {
    const n = new Set(visible); if (n.has(k)) n.delete(k); else n.add(k);
    setVisible(n);
    try { localStorage.setItem("leads.cols", JSON.stringify([...n])); } catch { /* ignore */ }
  };
  const ids = useMemo(() => [...sel], [sel]);
  const allSelected = rows.length > 0 && sel.size === rows.length;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => {
    const r = await fn();
    if (r.ok) { toast.success(ok); setSel(new Set()); } else toast.error(r.error ?? "Failed");
  });

  if (rows.length === 0) return <EmptyState title="No leads match" body="Add a lead, import a CSV, share a capture form, or run a discovery source. Matching leads will appear here." />;
  const show = (k: ColKey) => visible.has(k);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canWrite && sel.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-navy p-2 text-sm text-white">
            <span className="px-2">{sel.size} selected</span>
            <select aria-label="Assign selected" className="min-h-9 rounded bg-card px-2 text-foreground" defaultValue="" onChange={(e) => { const v = e.target.value; if (v) run(() => bulkAssign(ids, v === "none" ? null : v), "Assigned"); e.target.value = ""; }}>
              <option value="">Assign to…</option><option value="none">Unassign</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <Button variant="outline" disabled={pending} className="min-h-9 text-foreground" onClick={() => { const t = prompt("Tag to add"); if (t) run(() => bulkTag(ids, t), "Tagged"); }}>Tag</Button>
            <Button variant="outline" disabled={pending} className="min-h-9 text-foreground" onClick={() => run(() => rescoreLeads(ids), "Re-scored")}>Re-score</Button>
            <Button variant="danger" disabled={pending} className="min-h-9" onClick={() => { if (confirm(`Archive ${sel.size} lead(s)?`)) run(() => archiveLeads(ids), "Archived"); }}>Archive</Button>
          </div>
        ) : <span />}
        <div className="relative">
          <Button variant="outline" onClick={() => setShowCols(!showCols)} aria-expanded={showCols}><Columns3 size={16} /> Columns</Button>
          {showCols && (
            <div className="absolute right-0 z-10 mt-1 w-44 space-y-1 rounded-lg border border-border bg-card p-2 shadow-lg">
              {COLS.map((c) => <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible.has(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}</label>)}
            </div>
          )}
        </div>
      </div>

      {/* Desktop table */}
      <Card className="hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              {canWrite && <th className="w-10 p-3"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}
              <th className="p-3">Lead</th>{show("company") && <th className="p-3">Company</th>}{show("contact") && <th className="p-3">Contact</th>}{show("country") && <th className="p-3">Country</th>}
              {show("source") && <th className="p-3">Source</th>}{show("score") && <th className="p-3">Score</th>}{show("status") && <th className="p-3">Status</th>}
              {show("assignee") && <th className="p-3">Assigned</th>}{show("created") && <th className="p-3">Added</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-black/5 dark:hover:bg-white/5">
                {canWrite && <td className="p-3"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => { const n = new Set(sel); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setSel(n); }} /></td>}
                <td className="p-3 font-medium"><Link href={`/leads/${r.id}`} className="hover:underline">{r.name}</Link></td>
                {show("company") && <td className="p-3">{r.company ?? "-"}</td>}
                {show("contact") && <td className="max-w-48 truncate p-3 text-muted">{r.email ?? r.phone ?? "-"}</td>}
                {show("country") && <td className="p-3">{r.country ?? "-"}</td>}
                {show("source") && <td className="p-3">{r.source}</td>}
                {show("score") && <td className="p-3"><span className="mr-2 font-semibold">{r.score ?? "-"}</span><QualBadge q={r.qualification} /></td>}
                {show("status") && <td className="p-3 capitalize">{r.status}</td>}
                {show("assignee") && <td className="p-3">{r.assignee ?? <span className="text-muted">Unassigned</span>}</td>}
                {show("created") && <td className="whitespace-nowrap p-3 text-muted"><time suppressHydrationWarning>{new Date(r.created_at).toLocaleDateString()}</time></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <Card key={r.id} className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                {canWrite && <input type="checkbox" className="mt-1 size-5" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => { const n = new Set(sel); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setSel(n); }} />}
                <Link href={`/leads/${r.id}`} className="min-w-0 truncate font-semibold hover:underline">{r.name}</Link>
              </div>
              <QualBadge q={r.qualification} />
            </div>
            <p className="text-sm text-muted">{[r.company, r.country].filter(Boolean).join(" · ") || r.source}</p>
            <p className="text-sm">Score <b>{r.score ?? "-"}</b> · <span className="capitalize">{r.status}</span></p>
          </Card>
        ))}
      </div>
    </div>
  );
}

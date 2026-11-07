"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changeStage } from "@/lib/actions/leads";
import { addStage, deleteStage, renameStage } from "@/lib/actions/crm";
import { Button, Input, QualBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type BoardStage = { id: string; name: string; kind: "open" | "won" | "lost"; position: number };
export type BoardLead = { id: string; name: string; company: string | null; score: number | null; qualification: string; est_value: number | null; stage_id: string | null };

function Card({ lead, dragging }: { lead: BoardLead; dragging?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 text-sm shadow-sm", dragging && "rotate-1 shadow-lg")}>
      <div className="flex items-start justify-between gap-2"><Link href={`/leads/${lead.id}`} className="min-w-0 truncate font-medium hover:underline" onPointerDown={(e) => e.stopPropagation()}>{lead.name}</Link><QualBadge q={lead.qualification} /></div>
      <p className="truncate text-xs text-muted">{lead.company ?? ""}</p>
      <p className="mt-1 text-xs">Score {lead.score ?? "-"}{lead.est_value ? ` · ${lead.est_value.toLocaleString()}` : ""}</p>
    </div>
  );
}
function Draggable({ lead, disabled }: { lead: BoardLead; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, disabled });
  return <div ref={setNodeRef} {...listeners} {...attributes} className={cn("touch-none", isDragging && "opacity-40")}><Card lead={lead} /></div>;
}
function Column({ stage, children, count, value, manage }: { stage: BoardStage; children: React.ReactNode; count: number; value: number; manage?: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section ref={setNodeRef} aria-label={stage.name} className={cn("flex w-64 shrink-0 flex-col rounded-xl bg-black/5 p-2 dark:bg-white/5", isOver && "ring-2 ring-primary")}>
      <header className="mb-2 flex items-center justify-between px-1">
        <h2 className={cn("text-sm font-semibold", stage.kind === "won" && "text-green-700 dark:text-primary", stage.kind === "lost" && "text-red-600")}>{stage.name} <span className="text-muted">({count})</span></h2>
        {manage}
      </header>
      {value > 0 && <p className="mb-2 px-1 text-xs text-muted">{value.toLocaleString()} est.</p>}
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  );
}

export function Board({ stages, leads, canWrite, canManage }: { stages: BoardStage[]; leads: BoardLead[]; canWrite: boolean; canManage: boolean }) {
  const router = useRouter();
  const [local, setLocal] = useState(leads);
  const [active, setActive] = useState<BoardLead | null>(null);
  const [name, setName] = useState("");
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }));
  const [prev, setPrev] = useState(leads);
  if (prev !== leads) { setPrev(leads); setLocal(leads); } // re-sync after server refresh

  function onEnd(e: DragEndEvent) {
    setActive(null);
    const lead = local.find((l) => l.id === e.active.id); const stage = stages.find((s) => s.id === e.over?.id);
    if (!lead || !stage || lead.stage_id === stage.id) return;
    let reason: string | undefined;
    if (stage.kind === "lost") { reason = prompt("Why was this lead lost?") ?? undefined; if (!reason) return; }
    const before = local;
    setLocal(local.map((l) => (l.id === lead.id ? { ...l, stage_id: stage.id } : l))); // optimistic
    start(async () => {
      const r = await changeStage(lead.id, stage.id, reason);
      if (!r.ok) { setLocal(before); toast.error(r.error); } else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addStage(name); if (r.ok) { setName(""); router.refresh(); } else toast.error(r.error); }); }}>
          <Input aria-label="New stage name" placeholder="New stage name" value={name} onChange={(e) => setName(e.target.value)} /><Button type="submit" variant="outline" disabled={!name.trim()}>Add stage</Button>
        </form>
      )}
      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActive(local.find((l) => l.id === e.active.id) ?? null)} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((s) => {
            const items = local.filter((l) => l.stage_id === s.id);
            return (
              <Column key={s.id} stage={s} count={items.length} value={items.reduce((a, l) => a + (l.est_value ?? 0), 0)}
                manage={canManage && s.kind === "open" ? (
                  <span className="flex gap-1 text-xs">
                    <button className="underline" onClick={() => { const n = prompt("Rename stage", s.name); if (n) start(async () => { const r = await renameStage(s.id, n); if (r.ok) router.refresh(); else toast.error(r.error); }); }}>Rename</button>
                    <button className="underline text-red-600" onClick={() => { if (confirm(`Delete stage "${s.name}"?`)) start(async () => { const r = await deleteStage(s.id); if (r.ok) router.refresh(); else toast.error(r.error); }); }}>Delete</button>
                  </span>
                ) : undefined}>
                {items.map((l) => <Draggable key={l.id} lead={l} disabled={!canWrite} />)}
              </Column>
            );
          })}
        </div>
        <DragOverlay>{active ? <Card lead={active} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updatePlanLimits } from "@/lib/actions/admin";
import { Button, Card, Textarea } from "@/components/ui/primitives";

export function PlanEditor({ plans }: { plans: { id: string; name: string; price: number; stripe: string; limits: string }[] }) {
  const [vals, setVals] = useState(Object.fromEntries(plans.map((p) => [p.id, p.limits])));
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {plans.map((p) => (
        <Card key={p.id} className="space-y-2">
          <h2 className="font-semibold">{p.name} <span className="text-sm font-normal text-muted">({p.id}) · {(p.price / 100).toFixed(2)}/mo · Stripe price: {p.stripe || "not linked"}</span></h2>
          <Textarea aria-label={`Limits for ${p.name}`} rows={9} className="font-mono text-xs" value={vals[p.id]} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} />
          <Button disabled={pending} onClick={() => start(async () => { const r = await updatePlanLimits(p.id, vals[p.id]); if (r.ok) toast.success("Limits updated"); else toast.error(r.error); })}>Save limits</Button>
        </Card>
      ))}
    </div>
  );
}

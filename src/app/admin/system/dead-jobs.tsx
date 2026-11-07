"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { retryDeadJob } from "@/lib/actions/admin";
import { Button } from "@/components/ui/primitives";

export function DeadJobs({ jobs }: { jobs: { id: string; type: string; error: string; attempts: number }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!jobs.length) return <p className="text-sm text-muted">Empty: no permanently failed jobs.</p>;
  return <ul className="space-y-2 text-sm">{jobs.map((j) => <li key={j.id} className="flex items-center justify-between gap-2"><span className="min-w-0"><b>{j.type}</b> <span className="text-muted">({j.attempts} attempts)</span><br /><span className="break-words text-xs text-red-600">{j.error}</span></span><Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await retryDeadJob(j.id); if (r.ok) { toast.success("Re-queued"); router.refresh(); } else toast.error(r.error); })}>Retry</Button></li>)}</ul>;
}

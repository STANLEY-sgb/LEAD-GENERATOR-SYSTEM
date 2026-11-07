import Link from "next/link";
import { nowMs } from "@/lib/time";
import { getMembers, getOrgContext } from "@/lib/org-context";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { TaskList, TaskRow } from "./list";

export const metadata = { title: "Follow-ups" };

export default async function Page({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  const { supabase, org, userId, role } = await getOrgContext();
  let q = supabase.from("follow_up_tasks").select("id, title, type, due_at, completed_at, assigned_to, lead_id, leads(name)").eq("organization_id", org!.id).is("completed_at", null).order("due_at").limit(200);
  if (scope !== "all") q = q.eq("assigned_to", userId);
  const [{ data }, members] = await Promise.all([q, getMembers(supabase, org!.id)]);
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  const now = nowMs();
  const rows = (data ?? []).map((t) => ({ id: t.id, title: t.title, type: t.type, due: t.due_at, lead: (t.leads as unknown as { name: string } | null)?.name ?? null, leadId: t.lead_id, who: t.assigned_to ? names.get(t.assigned_to) ?? "Member" : "Unassigned", overdue: new Date(t.due_at).getTime() < now }));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Follow-up tasks" description="Calls, emails, meetings and reminders." actions={<>
        <Link href="/tasks" className={`rounded-lg border px-3 py-2 text-sm ${scope !== "all" ? "bg-navy text-white" : "bg-card"}`}>Mine</Link>
        <Link href="/tasks?scope=all" className={`rounded-lg border px-3 py-2 text-sm ${scope === "all" ? "bg-navy text-white" : "bg-card"}`}>Everyone</Link></>} />
      <TaskList canWrite={role !== "analyst"} />
      {rows.length === 0 ? <EmptyState title="Nothing due" body="Schedule follow-ups from a lead page, or let an automation create them." /> : (
        <Card className="divide-y divide-border p-0">
          {rows.map((t) => (
            <TaskRow key={t.id} t={t} canWrite={role !== "analyst"} />
          ))}
        </Card>
      )}
      <p className="text-xs text-muted">External calendar sync (Google/Outlook) is planned; tasks are stored in a calendar-friendly format (title, type, due time).</p>
    </div>
  );
}


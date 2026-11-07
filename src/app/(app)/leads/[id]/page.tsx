import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { getMembers, getOrgContext } from "@/lib/org-context";
import { Badge, Card, QualBadge } from "@/components/ui/primitives";
import { aiProviderConfigured } from "@/lib/env";
import { LeadActions } from "./actions";
import type { Factor } from "@/lib/leads/scoring";

export const metadata = { title: "Lead" };
const EVIDENCE_TONE = { verified: "success", inferred: "warning", unverified: "neutral", missing: "neutral" } as const;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org, role } = await getOrgContext();
  const orgId = org!.id;
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).eq("organization_id", orgId).is("deleted_at", null).maybeSingle();
  if (!lead) notFound();

  const [stages, tags, notes, acts, score, tasks, dups, hist, members] = await Promise.all([
    supabase.from("pipeline_stages").select("id, name, kind").eq("organization_id", orgId).order("position"),
    supabase.from("lead_tags").select("tag").eq("lead_id", id),
    supabase.from("lead_notes").select("id, body, created_at, author_id").eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("lead_activities").select("id, type, body, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("lead_scores").select("explanation, factors, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("follow_up_tasks").select("id, title, type, due_at, completed_at").eq("lead_id", id).order("due_at").limit(20),
    supabase.from("duplicate_candidates").select("id, reason, other_lead_id, leads!duplicate_candidates_other_lead_id_fkey(name, company)").eq("lead_id", id).eq("status", "pending"),
    supabase.from("lead_sources_history").select("source, attribution, seen_at").eq("lead_id", id).order("seen_at", { ascending: false }),
    getMembers(supabase, orgId),
  ]);
  const factors = (score.data?.factors ?? []) as Factor[];
  const summary = lead.ai_summary as null | { overview: string; relevant_offering: string; match_reason: string; likely_needs: string[]; suggested_approach: string; next_action: string; generated_at: string };
  const canWrite = role !== "analyst";
  const authors = new Map(members.map((m) => [m.user_id, m.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/leads" className="text-sm text-muted hover:underline">← Leads</Link>
          <h1 className="truncate text-2xl font-bold">{lead.name}</h1>
          <p className="text-sm text-muted">{[lead.company, lead.country, lead.industry].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-2"><span className="text-3xl font-bold">{lead.score ?? "-"}</span><QualBadge q={lead.qualification} /></div>
      </div>

      <LeadActions
        canWrite={canWrite} aiEnabled={aiProviderConfigured()}
        lead={{ id: lead.id, name: lead.name, company: lead.company ?? "", phone: lead.phone ?? "", website: lead.website ?? "", country: lead.country ?? "", industry: lead.industry ?? "", estValue: lead.est_value?.toString() ?? "", stageId: lead.stage_id, assignedTo: lead.assigned_to }}
        stages={stages.data ?? []} members={members.map((m) => ({ id: m.user_id, name: m.name }))} tags={(tags.data ?? []).map((t) => t.tag)}
        notes={(notes.data ?? []).map((n) => ({ id: n.id, body: n.body, at: n.created_at, by: n.author_id ? authors.get(n.author_id) ?? "Member" : "System" }))}
        tasks={tasks.data ?? []}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">Why this score</h2>
          <p className="text-sm">{score.data?.explanation ?? "Not scored yet."}</p>
          <ul className="space-y-2">
            {factors.map((f) => (
              <li key={f.key} className="text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{f.label}</span><span className="flex items-center gap-2"><Badge tone={EVIDENCE_TONE[f.evidence]}>{f.evidence}</Badge><span className="w-12 text-right tabular-nums">{f.points}</span></span></div>
                <div className="mt-1 h-1.5 rounded bg-black/10 dark:bg-white/10"><div className="h-full rounded bg-primary" style={{ width: `${Math.round(f.value * 100)}%` }} /></div>
                <p className="mt-0.5 text-xs text-muted">{f.detail}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Heuristic scoring against your approved profile. “Inferred” and “unverified” items are not confirmed facts.</p>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-2">
            <h2 className="font-semibold">AI brief</h2>
            {summary ? (
              <div className="space-y-2 text-sm">
                <Badge tone="warning">AI-generated · review before relying on it</Badge>
                <p>{summary.overview}</p>
                <p><b>Relevant offering:</b> {summary.relevant_offering}</p><p><b>Why it matches:</b> {summary.match_reason}</p>
                {summary.likely_needs?.length > 0 && <p><b>Likely needs:</b> {summary.likely_needs.join("; ")}</p>}
                <p><b>Suggested approach:</b> {summary.suggested_approach}</p><p><b>Next action:</b> {summary.next_action}</p>
              </div>
            ) : <p className="text-sm text-muted">No brief yet.</p>}
          </Card>

          <Card className="space-y-1 text-sm">
            <h2 className="font-semibold">Contact &amp; consent</h2>
            <p>Email: {lead.email ?? "-"} {lead.email && <Badge>unverified</Badge>}</p>
            <p>Phone: {lead.phone ?? "-"} {lead.phone && <Badge>unverified</Badge>}</p>
            <p>Website: {lead.website ?? "-"}</p>
            <p>Consent: <Badge tone={lead.consent_status === "granted" ? "success" : lead.consent_status === "withdrawn" || lead.consent_status === "denied" ? "warning" : "neutral"}>{lead.consent_status}</Badge> {lead.legal_basis && <span className="text-muted">· basis: {lead.legal_basis}</span>}</p>
            {Object.keys(lead.consent_evidence ?? {}).length > 0 && <p className="break-words text-xs text-muted">Evidence: {JSON.stringify(lead.consent_evidence)}</p>}
          </Card>

          {(dups.data?.length ?? 0) > 0 && (
            <Card className="space-y-2 text-sm">
              <h2 className="font-semibold">Possible duplicates</h2>
              {dups.data!.map((d) => { const o = d.leads as unknown as { name: string } | null; return <p key={d.id}><Link className="underline" href={`/leads/${d.other_lead_id}`}>{o?.name ?? "Lead"}</Link> <span className="text-muted">({d.reason})</span></p>; })}
              <p className="text-xs text-muted">Records are never merged automatically when identity is uncertain.</p>
            </Card>
          )}

          <Card className="space-y-1 text-sm">
            <h2 className="font-semibold">Sources</h2>
            {(hist.data ?? []).map((h, i) => <p key={i}>{h.source} <span className="text-muted">· {h.attribution ?? ""} · {new Date(h.seen_at).toLocaleDateString()}</span></p>)}
          </Card>
        </div>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Activity</h2>
        <ul className="space-y-2 text-sm">
          {(acts.data ?? []).map((a) => <li key={a.id} className="flex justify-between gap-3"><span><b className="capitalize">{a.type.replace("_", " ")}</b>{a.body ? ` — ${a.body}` : ""}</span><span className="shrink-0 text-muted">{new Date(a.created_at).toLocaleString()}</span></li>)}
        </ul>
      </Card>
    </div>
  );
}

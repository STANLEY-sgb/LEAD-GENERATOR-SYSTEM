import "server-only";
import { generateLeadSummary } from "@/lib/ai/summary";
import { handleWorkflowEvent } from "@/lib/automation/engine";
import { getConnector, RateLimitedError } from "@/lib/connectors";
import type { EventType } from "@/lib/events";
import { emitEvent } from "@/lib/events";
import { ingestLead, loadScoringSetup } from "@/lib/leads/ingest";
import { createAdminClient } from "@/lib/supabase/admin";
import { handlers } from "./index";

handlers["workflow.event"] = async ({ organization_id, payload }) => {
  const p = payload as { type: EventType; leadId: string; eventId: string; depth: number };
  await handleWorkflowEvent({ orgId: organization_id!, type: p.type, leadId: p.leadId, eventId: p.eventId, depth: p.depth ?? 0 });
};

handlers["ai.summary"] = async ({ organization_id, payload }) => {
  await generateLeadSummary(organization_id!, (payload as { leadId: string }).leadId);
};

handlers["discovery.run"] = async ({ organization_id, payload }) => {
  const admin = createAdminClient();
  const runId = (payload as { runId: string }).runId;
  const { data: run } = await admin.from("discovery_runs").select("*").eq("id", runId).eq("organization_id", organization_id!).single();
  if (!run || run.status === "succeeded") return;
  await admin.from("discovery_runs").update({ status: "running" }).eq("id", runId);
  try {
    const connector = getConnector(run.connector);
    if (!connector?.search) throw new Error("Connector does not support discovery");
    if (!connector.configured()) throw new Error(`Connector not configured: set ${connector.requiredEnv.join(", ")}`);
    const q = run.query as { keywords: string[]; location?: string; limit: number; campaignId?: string };

    // Campaign daily cap
    let allowance = q.limit;
    if (q.campaignId) {
      const { data: camp } = await admin.from("campaigns").select("daily_limit, status").eq("id", q.campaignId).eq("organization_id", organization_id!).single();
      if (!camp || camp.status !== "active") throw new Error("Campaign is not active");
      const day = new Date(); day.setUTCHours(0, 0, 0, 0);
      const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("campaign_id", q.campaignId).gte("created_at", day.toISOString());
      allowance = Math.min(allowance, Math.max(0, camp.daily_limit - (count ?? 0)));
    }
    const found = allowance > 0 ? await connector.search({ keywords: q.keywords, location: q.location, limit: allowance }) : [];
    const setup = await loadScoringSetup(organization_id!);
    let created = 0, duplicates = 0;
    for (const lead of found.slice(0, allowance)) {
      const r = await ingestLead(organization_id!, { ...lead, campaignId: q.campaignId ?? null }, setup);
      if (r.outcome === "created") created++;
      else if (r.outcome === "duplicate") duplicates++;
      else if (r.outcome === "limit_reached") break;
    }
    await admin.from("discovery_runs").update({ status: "succeeded", found: found.length, created, duplicates, finished_at: new Date().toISOString() }).eq("id", runId);
    await admin.from("lead_sources").update({ last_run_at: new Date().toISOString(), last_error: null }).eq("organization_id", organization_id!).eq("connector", run.connector);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Discovery failed";
    // Rate limits are retried by the queue with backoff; other failures are final for this run.
    if (e instanceof RateLimitedError) { await admin.from("discovery_runs").update({ status: "queued" }).eq("id", runId); throw e; }
    await admin.from("discovery_runs").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", runId);
    await admin.from("lead_sources").update({ last_error: msg }).eq("organization_id", organization_id!).eq("connector", run.connector);
    throw e;
  }
};

/** Hourly: emits lead.stale for untouched new leads (one event per lead per day). */
handlers["stale.scan"] = async () => {
  const admin = createAdminClient();
  const { data: wfs } = await admin.from("automation_workflows").select("organization_id, trigger_config").eq("trigger_type", "lead.stale").eq("active", true);
  const day = new Date().toISOString().slice(0, 10);
  for (const wf of wfs ?? []) {
    const days = Number((wf.trigger_config as { days?: number })?.days ?? 3);
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data: leads } = await admin.from("leads").select("id").eq("organization_id", wf.organization_id).eq("status", "new").is("deleted_at", null).lt("created_at", cutoff).limit(200);
    for (const l of leads ?? []) await emitEvent(wf.organization_id, "lead.stale", l.id, { eventId: `stale:${l.id}:${day}` });
  }
};

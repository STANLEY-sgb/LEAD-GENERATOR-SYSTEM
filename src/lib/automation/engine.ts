import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hmacHex, signToken, encryptionConfigured } from "@/lib/crypto";
import { emailConfigured, sendEmail } from "@/lib/email";
import { emitEvent, MAX_EVENT_DEPTH, type EventType } from "@/lib/events";
import { notifyOrg } from "@/lib/notify";
import { enqueue } from "@/lib/queue";
import { assertPublicHttpsUrl } from "./ssrf";
import { evalConditions, type Condition, type LeadFacts } from "./conditions";

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_tag"), tag: z.string().trim().min(1).max(40) }),
  z.object({ type: z.literal("update_stage"), stage: z.string().trim().min(1).max(60) }),
  z.object({ type: z.literal("assign"), user_id: z.string().uuid().or(z.literal("round_robin")) }),
  z.object({ type: z.literal("notify"), title: z.string().trim().min(1).max(120), message: z.string().max(500).optional() }),
  z.object({ type: z.literal("create_task"), title: z.string().trim().min(1).max(200), task_type: z.enum(["call", "email", "meeting", "follow_up", "review"]).default("follow_up"), due_in_hours: z.coerce.number().int().min(1).max(24 * 90).default(24) }),
  z.object({ type: z.literal("ai_summary") }),
  z.object({ type: z.literal("webhook"), url: z.string().url(), secret: z.string().max(200).optional() }),
  z.object({ type: z.literal("send_email"), subject: z.string().trim().min(1).max(150), body: z.string().trim().min(1).max(3000) }),
]);
export type Action = z.infer<typeof ActionSchema>;
export const MAX_ACTIONS = 10;
const HOURLY_EXECUTION_CAP = 500;   // guard against runaway automation
const HOURLY_EMAIL_CAP = 50;        // guard against accidental bulk messaging

type Admin = ReturnType<typeof createAdminClient>;

async function loadFacts(admin: Admin, orgId: string, leadId: string) {
  const { data: lead } = await admin.from("leads").select("*, pipeline_stages(name)").eq("id", leadId).eq("organization_id", orgId).is("deleted_at", null).maybeSingle();
  if (!lead) return null;
  const [{ data: tags }, { count: contacts }] = await Promise.all([
    admin.from("lead_tags").select("tag").eq("lead_id", leadId),
    admin.from("lead_activities").select("id", { count: "exact", head: true }).eq("lead_id", leadId).in("type", ["email_sent", "call", "contacted"]),
  ]);
  const facts: LeadFacts = {
    score: lead.score, qualification: lead.qualification, country: lead.country, industry: lead.industry, source: lead.source, status: lead.status,
    consent_status: lead.consent_status, email: lead.email, phone: lead.phone, contacted: (contacts ?? 0) > 0,
    tags: (tags ?? []).map((t) => t.tag), stage: (lead.pipeline_stages as { name: string } | null)?.name ?? null,
  };
  return { lead, facts };
}

function render(tpl: string, lead: { name: string; company: string | null }) {
  return tpl.replaceAll("{{name}}", lead.name).replaceAll("{{company}}", lead.company ?? "your company");
}

async function runAction(admin: Admin, orgId: string, a: Action, ctx: { lead: Record<string, any>; executionId: string; depth: number; wfName: string }): Promise<string> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { lead } = ctx;
  switch (a.type) {
    case "add_tag": {
      await admin.from("lead_tags").upsert({ organization_id: orgId, lead_id: lead.id, tag: a.tag }, { onConflict: "lead_id,tag", ignoreDuplicates: true });
      return `Tagged "${a.tag}"`;
    }
    case "update_stage": {
      const { data: st } = await admin.from("pipeline_stages").select("id, kind, name").eq("organization_id", orgId).ilike("name", a.stage).maybeSingle();
      if (!st) throw new Error(`Stage "${a.stage}" not found`);
      await admin.from("leads").update({
        stage_id: st.id, status: st.kind === "won" ? "converted" : st.kind === "lost" ? "lost" : lead.status === "new" && st.name !== "New Lead" ? "contacted" : lead.status,
        converted_at: st.kind === "won" ? new Date().toISOString() : null,
      }).eq("id", lead.id).eq("organization_id", orgId);
      await admin.from("lead_activities").insert({ organization_id: orgId, lead_id: lead.id, type: "stage_changed", body: `Moved to ${st.name} by automation "${ctx.wfName}"` });
      await emitEvent(orgId, "lead.stage_changed", lead.id, { eventId: `stage:${lead.id}:${st.id}:${ctx.executionId}`, depth: ctx.depth + 1 });
      return `Moved to ${st.name}`;
    }
    case "assign": {
      let userId = a.user_id as string;
      if (userId === "round_robin") {
        const { data: reps } = await admin.from("organization_members").select("user_id").eq("organization_id", orgId).in("role", ["sales_rep", "sales_manager"]).order("user_id");
        if (!reps?.length) throw new Error("No sales members to assign to");
        const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", orgId).not("assigned_to", "is", null);
        userId = reps[(count ?? 0) % reps.length].user_id;
      }
      const { error } = await admin.from("leads").update({ assigned_to: userId }).eq("id", lead.id).eq("organization_id", orgId);
      if (error) throw error;
      await notifyOrg(orgId, { userIds: [userId], kind: "general", type: "assigned", title: `Lead assigned: ${lead.name}`, link: `/leads/${lead.id}` });
      return "Assigned";
    }
    case "notify": {
      await notifyOrg(orgId, { roles: ["owner", "admin", "sales_manager"], kind: "general", type: "automation", title: render(a.title, lead as never), body: a.message ? render(a.message, lead as never) : undefined, link: `/leads/${lead.id}` });
      return "Notification sent";
    }
    case "create_task": {
      await admin.from("follow_up_tasks").insert({ organization_id: orgId, lead_id: lead.id, assigned_to: lead.assigned_to, type: a.task_type, title: render(a.title, lead as never), due_at: new Date(Date.now() + a.due_in_hours * 3600_000).toISOString() });
      return "Task created";
    }
    case "ai_summary": {
      await enqueue("ai.summary", { leadId: lead.id }, { orgId, idempotencyKey: `summary:${ctx.executionId}` });
      return "AI summary queued";
    }
    case "webhook": {
      const u = await assertPublicHttpsUrl(a.url);
      const body = JSON.stringify({ event: "automation.action", lead: { id: lead.id, name: lead.name, company: lead.company, email: lead.email, score: lead.score, qualification: lead.qualification, source: lead.source }, execution_id: ctx.executionId });
      const res = await fetch(u, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json", ...(a.secret ? { "x-leadpilot-signature": hmacHex(a.secret, body) } : {}), "idempotency-key": ctx.executionId }, body });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
      return `Webhook delivered (${res.status})`;
    }
    case "send_email": {
      // Compliance gates: explicit consent on record, address present, not suppressed, provider configured, hourly cap.
      if (!emailConfigured()) throw new Error("Email provider is not configured");
      if (!encryptionConfigured()) throw new Error("CREDENTIAL_ENCRYPTION_KEY is required to sign unsubscribe links");
      if (!lead.email) throw new Error("Lead has no e-mail address");
      if (lead.consent_status !== "granted") throw new Error("Blocked: no recorded consent to contact this lead");
      const { data: sup } = await admin.from("suppression_list").select("id").eq("organization_id", orgId).eq("email_normalized", lead.email_normalized).maybeSingle();
      if (sup) throw new Error("Blocked: address is on the suppression list");
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await admin.from("automation_logs").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("action", "send_email").eq("status", "ok").gte("created_at", since);
      if ((count ?? 0) >= HOURLY_EMAIL_CAP) throw new Error("Hourly e-mail safety cap reached");
      const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/unsubscribe/${signToken(`${orgId}:${lead.id}`)}`;
      await sendEmail({ to: lead.email, subject: render(a.subject, lead as never), text: `${render(a.body, lead as never)}\n\n--\nTo stop receiving these messages: ${link}`, headers: { "List-Unsubscribe": `<${link}>` } });
      await admin.from("lead_activities").insert({ organization_id: orgId, lead_id: lead.id, type: "email_sent", body: `Automated e-mail: ${a.subject}` });
      return "Email sent";
    }
  }
}

/** Runs all active workflows matching an event. Each (workflow, event) pair executes at most once. */
export async function handleWorkflowEvent(p: { orgId: string; type: EventType; leadId: string; eventId: string; depth: number; workflowId?: string }) {
  if (p.depth > MAX_EVENT_DEPTH) return;
  const admin = createAdminClient();
  let wq = admin.from("automation_workflows").select("*").eq("organization_id", p.orgId).eq("trigger_type", p.type);
  wq = p.workflowId ? wq.eq("id", p.workflowId) : wq.eq("active", true);
  const { data: workflows } = await wq;
  if (!workflows?.length) return;
  const loaded = await loadFacts(admin, p.orgId, p.leadId);
  if (!loaded) return;

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count: recent } = await admin.from("automation_executions").select("id", { count: "exact", head: true }).eq("organization_id", p.orgId).gte("started_at", since);
  let budget = HOURLY_EXECUTION_CAP - (recent ?? 0);

  for (const wf of workflows) {
    if (budget-- <= 0) break;
    const { data: exec, error } = await admin.from("automation_executions").insert({ organization_id: p.orgId, workflow_id: wf.id, lead_id: p.leadId, idempotency_key: p.eventId }).select("id").single();
    if (error) { if (error.code === "23505") continue; throw error; }
    const finish = (status: string, err?: string) => admin.from("automation_executions").update({ status, error: err ?? null, finished_at: new Date().toISOString() }).eq("id", exec.id);
    try {
      if (!evalConditions(loaded.facts, (wf.conditions ?? []) as Condition[])) { await finish("skipped"); continue; }
      const actions = z.array(ActionSchema).max(MAX_ACTIONS).parse(wf.actions);
      let i = 0;
      for (const a of actions) {
        i++;
        try {
          const msg = await runAction(admin, p.orgId, a, { lead: loaded.lead, executionId: exec.id, depth: p.depth, wfName: wf.name });
          await admin.from("automation_logs").insert({ organization_id: p.orgId, execution_id: exec.id, step: i, action: a.type, status: "ok", message: msg });
        } catch (e) {
          const m = e instanceof Error ? e.message : "Action failed";
          await admin.from("automation_logs").insert({ organization_id: p.orgId, execution_id: exec.id, step: i, action: a.type, status: "error", message: m });
          throw e;
        }
      }
      await finish("succeeded");
    } catch (e) {
      const m = e instanceof Error ? e.message : "Workflow failed";
      await finish("failed", m);
      await notifyOrg(p.orgId, { roles: ["owner", "admin"], kind: "automation_failures", type: "automation_failed", title: `Automation failed: ${wf.name}`, body: m, link: "/automation" }).catch(() => undefined);
    }
  }
}

/** Manual retry of a failed execution: re-runs the workflow for the same lead under a fresh idempotency key. */
export async function retryExecution(orgId: string, executionId: string) {
  const admin = createAdminClient();
  const { data: ex } = await admin.from("automation_executions").select("workflow_id, lead_id, status, automation_workflows(trigger_type)").eq("id", executionId).eq("organization_id", orgId).single();
  if (!ex || ex.status !== "failed" || !ex.lead_id) throw new Error("Only failed executions can be retried");
  const type = (ex.automation_workflows as unknown as { trigger_type: EventType }).trigger_type;
  await handleWorkflowEvent({ orgId, type, leadId: ex.lead_id, eventId: `retry:${executionId}:${Date.now()}`, depth: 0, workflowId: ex.workflow_id });
}

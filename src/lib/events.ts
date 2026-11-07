import "server-only";
import { enqueue } from "@/lib/queue";

export type EventType = "lead.created" | "lead.captured" | "lead.scored" | "lead.stage_changed" | "lead.stale";
export const MAX_EVENT_DEPTH = 3; // loop guard: workflow-caused events carry depth+1

/**
 * Publishes a domain event as a job. `eventId` doubles as the idempotency key, so re-emitting the same event
 * (retries, duplicate webhooks) can never trigger the same workflow twice.
 */
export async function emitEvent(orgId: string, type: EventType, leadId: string, opts: { eventId: string; depth?: number }) {
  const depth = opts.depth ?? 0;
  if (depth > MAX_EVENT_DEPTH) return;
  await enqueue("workflow.event", { type, leadId, eventId: opts.eventId, depth }, { orgId, idempotencyKey: `evt:${type}:${opts.eventId}` });
}

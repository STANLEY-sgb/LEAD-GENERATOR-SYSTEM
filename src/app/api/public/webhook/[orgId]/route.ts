import { NextResponse, after } from "next/server";
import { z } from "zod";
import { decrypt, hmacHex, safeEqual } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestLead } from "@/lib/leads/ingest";
import { processJobs } from "@/lib/queue";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const leadSchema = z.object({
  name: z.string().max(160).optional(), email: z.string().email().max(200).optional(), phone: z.string().max(40).optional(),
  company: z.string().max(160).optional(), website: z.string().max(300).optional(), country: z.string().max(80).optional(),
  industry: z.string().max(120).optional(), message: z.string().max(2000).optional(), external_id: z.string().max(200).optional(),
  consent_granted: z.boolean().optional(), consent_evidence: z.string().max(500).optional(),
});
const bodySchema = z.object({ leads: z.array(leadSchema).min(1).max(100) });

/** Signed inbound webhook. Header `x-leadpilot-signature` = hex HMAC-SHA256(secret, raw body). */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!rateLimit(`wh:${orgId}`, 60, 60_000) || !rateLimit(`wh-ip:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const admin = createAdminClient();
  const { data: cred } = await admin.from("integration_credentials").select("ciphertext, status").eq("organization_id", orgId).eq("provider", "inbound_webhook").maybeSingle();
  // Same 401 for "no webhook configured" and "bad signature" so org existence is not revealed.
  let ok = false;
  if (cred && cred.status === "connected") {
    try { ok = safeEqual(req.headers.get("x-leadpilot-signature") ?? "", hmacHex(decrypt(cred.ciphertext), raw)); } catch { ok = false; }
  }
  if (!ok) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try { body = bodySchema.parse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "invalid payload" }, { status: 400 }); }

  const outcomes = { created: 0, duplicate: 0, suppressed: 0, rejected: 0, limit_reached: 0 };
  for (const l of body.leads) {
    const r = await ingestLead(orgId, {
      name: l.name, email: l.email, phone: l.phone, company: l.company, website: l.website, country: l.country, industry: l.industry,
      intentText: l.message, source: "inbound_webhook", sourceRef: l.external_id ?? null, attribution: "Signed inbound webhook",
      consent: l.consent_granted ? { status: "granted", legalBasis: "consent (asserted by sender)", evidence: { statement: l.consent_evidence ?? null, at: new Date().toISOString() } } : { status: "unknown" },
    });
    if (r.outcome === "created") outcomes.created++;
    else if (r.outcome === "duplicate") outcomes.duplicate++;
    else if (r.outcome === "suppressed") outcomes.suppressed++;
    else if (r.outcome === "limit_reached") { outcomes.limit_reached++; break; }
    else outcomes.rejected++;
  }
  after(() => processJobs({ limit: 5, budgetMs: 20_000 }).catch(() => undefined));
  return NextResponse.json(outcomes);
}

import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestLead } from "@/lib/leads/ingest";
import { processJobs } from "@/lib/queue";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(160).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  consent: z.literal(true, { message: "Consent is required" }),
  website_url: z.string().max(0).optional(), // honeypot: real users never fill this
});

/** Public, consent-based lead capture. The org is derived from the form key, never from client input. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ip = clientIp(req);
  if (!rateLimit(`form:${ip}`, 10, 60_000) || !rateLimit(`form-key:${key}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (parsed.data.website_url) return NextResponse.json({ ok: true }); // silently drop bots

  const admin = createAdminClient();
  const { data: form } = await admin.from("lead_forms").select("id, organization_id, name, consent_text, active, organizations(status)").eq("public_key", key).maybeSingle();
  if (!form || !form.active || (form.organizations as unknown as { status: string } | null)?.status !== "active") {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }
  const d = parsed.data;
  const result = await ingestLead(form.organization_id, {
    name: d.name, email: d.email, phone: d.phone, company: d.company, intentText: d.message,
    source: "web_form", sourceRef: form.id, attribution: `Form: ${form.name}`,
    raw: { message: d.message },
    consent: { status: "granted", legalBasis: "consent",
      evidence: { text: form.consent_text, at: new Date().toISOString(), ip, user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null, form_id: form.id } },
  });
  if (result.outcome === "limit_reached") return NextResponse.json({ error: "This form is temporarily unavailable" }, { status: 503 });
  after(() => processJobs({ limit: 5, budgetMs: 20_000 }).catch(() => undefined)); // fire workflows promptly without a cron
  // Same response whether new, duplicate or suppressed: never reveal what the organization already holds.
  return NextResponse.json({ ok: true });
}

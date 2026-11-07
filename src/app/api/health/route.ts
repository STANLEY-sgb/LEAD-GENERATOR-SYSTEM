import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Deployment self-check. Reports which services are configured and whether the Supabase
 * schema (migrations) has been applied. Never returns secret values.
 */
export async function GET() {
  const env = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ai: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
    email: Boolean(process.env.RESEND_API_KEY),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
  };
  let database: "ok" | "unreachable" | "schema_missing" | "not_configured" = "not_configured";
  if (env.supabaseUrl && env.supabaseServiceRole) {
    try {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
      const { error } = await admin.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
      database = !error ? "ok" : /relation|schema cache|does not exist/i.test(error.message) ? "schema_missing" : "unreachable";
    } catch {
      database = "unreachable";
    }
  }
  const healthy = database === "ok" && env.supabasePublishableKey;
  return NextResponse.json({ healthy, database, env }, { status: healthy ? 200 : 503 });
}

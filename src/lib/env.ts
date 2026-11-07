/**
 * Central, validated environment access. Missing values produce an actionable message
 * (which variable, where to find it) instead of an opaque Supabase failure.
 */
const HINTS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "Supabase Dashboard → Project Settings → API → Project URL",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "Supabase Dashboard → Project Settings → API Keys → Publishable key (or legacy anon key)",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase Dashboard → Project Settings → API Keys → Secret / service_role key (server only)",
};

export function requireEnv(name: keyof typeof HINTS): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. Get it from: ${HINTS[name]}. Set it in .env.local (and in Vercel project settings).`);
  return v;
}

export const supabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export const aiProviderConfigured = () => Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

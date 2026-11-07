import Link from "next/link";

export const metadata = { title: "Setup required" };

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Supabase isn&apos;t connected yet</h1>
      <p className="mt-2 text-muted">The app needs these environment variables (in <code>.env.local</code> locally, or Vercel → Settings → Environment Variables):</p>
      <ul className="mt-4 list-disc space-y-1 pl-6 text-sm">
        <li><code>NEXT_PUBLIC_SUPABASE_URL</code></li>
        <li><code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code></li>
        <li><code>SUPABASE_SERVICE_ROLE_KEY</code> (server only)</li>
      </ul>
      <p className="mt-4 text-sm">Then apply <code>supabase/migrations/*.sql</code> and restart. Check status any time at <Link className="underline" href="/api/health">/api/health</Link>. Full steps are in <code>docs/SETUP.md</code>.</p>
    </main>
  );
}

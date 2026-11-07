import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin";

export const metadata = { title: "Platform admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const LINKS = [["/admin", "Overview"], ["/admin/organizations", "Organizations"], ["/admin/users", "Users"], ["/admin/plans", "Plans"], ["/admin/system", "System"], ["/admin/audit", "Audit log"], ["/admin/settings", "Settings"]];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin(); // strict server-side gate; non-admins get a 404
  return (
    <div className="min-h-dvh">
      <header className="bg-navy-dark text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <b className="text-primary">Platform admin</b>
          <nav className="flex flex-wrap gap-4 text-sm" aria-label="Admin">{LINKS.map(([h, l]) => <Link key={h} href={h} className="hover:underline">{l}</Link>)}</nav>
          <Link href="/dashboard" className="ml-auto text-sm text-muted hover:underline">← Back to app</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">{children}</main>
    </div>
  );
}

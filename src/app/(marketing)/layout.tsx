import Link from "next/link";
import { Zap } from "lucide-react";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-navy-dark text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 p-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold"><Zap className="text-primary" /> LeadPilot</Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm" aria-label="Site">
            <Link href="/features" className="hover:underline">Features</Link><Link href="/pricing" className="hover:underline">Pricing</Link><Link href="/about" className="hover:underline">About</Link><Link href="/contact" className="hover:underline">Contact</Link>
            <Link href="/login" className="hover:underline">Sign in</Link><Link href="/register" className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground">Get started</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">{children}</main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted"><Link href="/privacy" className="mx-2 hover:underline">Privacy</Link><Link href="/terms" className="mx-2 hover:underline">Terms</Link> · © {new Date().getFullYear()} LeadPilot</footer>
    </div>
  );
}

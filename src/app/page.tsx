import Link from "next/link";
import { Zap, Target, Brain, ShieldCheck } from "lucide-react";

const features = [
  { icon: Target, title: "Permitted discovery", body: "Official APIs, public business data and consent-based forms. No scraping of private data." },
  { icon: Brain, title: "Explainable AI scoring", body: "Every lead gets a 0–100 score with evidence, and verified vs inferred facts are kept apart." },
  { icon: ShieldCheck, title: "Tenant-isolated", body: "Row Level Security enforces isolation in the database, not just the UI." },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-navy-dark text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <span className="flex items-center gap-2 text-xl font-bold"><Zap className="text-primary" /> LeadPilot</span>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="px-3 py-2 hover:underline">Sign in</Link>
          <Link href="/register" className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">Get started</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-20">
        <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">Find customers while you <span className="text-primary">run your business.</span></h1>
        <p className="mt-6 max-w-2xl text-lg text-[#8190a3]">An AI sales assistant that discovers, qualifies and organizes prospects from permitted sources and hands you a ranked, explainable pipeline.</p>
        <div className="mt-20 grid gap-6 md:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-white/10 bg-navy p-6">
              <Icon className="mb-3 text-accent" />
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-[#8190a3]">{body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

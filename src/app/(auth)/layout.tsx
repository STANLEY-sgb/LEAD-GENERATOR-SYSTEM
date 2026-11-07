import Link from "next/link";
import { Zap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-navy-dark p-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold"><Zap className="text-primary" /> LeadPilot</Link>
        <div>
          <h2 className="text-4xl font-bold leading-tight">Your AI sales assistant, <span className="text-primary">working 24/7.</span></h2>
          <p className="mt-4 max-w-md text-[#8190a3]">Discover, qualify and convert customers from permitted sources, with every record traceable to its origin.</p>
        </div>
        <p className="text-xs text-[#8190a3]">Consent-first. Official APIs only.</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

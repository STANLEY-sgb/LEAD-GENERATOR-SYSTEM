"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { BarChart3, Bell, Bot, Building2, CalendarCheck, CreditCard, FileInput, Kanban, LayoutDashboard, LogOut, Megaphone, Menu, Moon, Package, Plug, Radar, Settings, Sun, Target, Users, UsersRound, Workflow, X, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Only routes that exist are listed; each phase appends its pages here.
const NAV: { href: string; label: string; icon: typeof Zap; group?: string }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users, group: "Sales" },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/tasks", label: "Follow-ups", icon: CalendarCheck },
  { href: "/discovery", label: "Discovery", icon: Radar, group: "Lead engine" },
  { href: "/capture", label: "Capture forms", icon: FileInput },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/automation", label: "Automation", icon: Workflow },
  { href: "/assistant", label: "AI assistant", icon: Bot },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/business-profile", label: "Business profile", icon: Building2, group: "Configure" },
  { href: "/products", label: "Products & services", icon: Package },
  { href: "/icp", label: "Ideal customer", icon: Target },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ orgName, role, isSuperAdmin, children }: { orgName: string; role: string; isSuperAdmin?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-dark text-white">
      <div className="flex items-center gap-2 p-5 text-lg font-bold"><Zap className="text-primary" /> LeadPilot</div>
      <div className="mx-4 mb-4 rounded-lg bg-navy p-3">
        <p className="truncate text-sm font-semibold">{orgName}</p>
        <p className="text-xs capitalize text-muted">{role.replace("_", " ")}</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
        {[...NAV, ...(isSuperAdmin ? [{ href: "/admin", label: "Platform admin", icon: Zap, group: "Platform" }] : [])].map(({ href, label, icon: Icon, group }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <div key={href}>
            {group && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{group}</p>}
            <Link href={href} onClick={() => setOpen(false)}
              className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                active ? "bg-primary text-primary-foreground font-semibold" : "text-white/80 hover:bg-navy")}>
              <Icon size={18} /> {label}
            </Link>
            </div>
          );
        })}
      </nav>
      <div className="space-y-1 p-3">
        <button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-white/80 hover:bg-navy">
          {resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />} Toggle theme
        </button>
        <button onClick={signOut} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-white/80 hover:bg-navy">
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-dark p-3 text-white lg:hidden">
        <span className="flex items-center gap-2 font-bold"><Zap className="text-primary" size={18} /> LeadPilot</span>
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="grid size-11 place-items-center"><Menu /></button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-2 top-2 z-10 grid size-11 place-items-center text-white"><X /></button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { openPortal, startCheckout } from "@/lib/actions/billing";
import { Button } from "@/components/ui/primitives";

export function PlanButtons({ planId, purchasable, enterprise, portal }: { planId?: string; purchasable?: boolean; enterprise?: boolean; portal?: boolean }) {
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<{ ok: boolean; error?: string; data?: { url: string } }>) => start(async () => { const r = await fn(); if (r.ok && r.data) window.location.href = r.data.url; else toast.error(r.error ?? "Failed"); });
  if (portal) return <Button variant="outline" disabled={pending} onClick={() => go(openPortal)}>Manage billing &amp; invoices</Button>;
  if (enterprise) return <a className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-semibold" href="/contact">Contact sales</a>;
  return <Button className="w-full" disabled={pending || !purchasable} title={purchasable ? "" : "Checkout isn't configured for this plan"} onClick={() => go(() => startCheckout(planId!))}>{purchasable ? "Choose plan" : "Unavailable"}</Button>;
}

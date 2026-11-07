"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
import { ADMIN_ROLES, fail, requireRole, type ActionResult } from "./helpers";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function startCheckout(planId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { orgId, userId } = await requireRole(ADMIN_ROLES);
    if (!stripeConfigured()) return { ok: false, error: "Billing is not configured yet (STRIPE_SECRET_KEY)." };
    const admin = createAdminClient();
    const { data: plan } = await admin.from("plans").select("id, stripe_price_id, active").eq("id", z.string().max(40).parse(planId)).single();
    if (!plan?.active || !plan.stripe_price_id) return { ok: false, error: "This plan is not available for self-service checkout. Contact sales." };
    const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("organization_id", orgId).single();
    const session = await stripe().checkout.sessions.create({
      mode: "subscription", line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      customer: sub?.stripe_customer_id ?? undefined,
      client_reference_id: orgId, metadata: { organization_id: orgId, plan_id: plan.id, user_id: userId },
      subscription_data: { metadata: { organization_id: orgId, plan_id: plan.id } },
      success_url: `${appUrl()}/billing?status=success`, cancel_url: `${appUrl()}/billing?status=cancelled`,
    });
    return { ok: true, data: { url: session.url! } };
  } catch (e) { return fail(e); }
}

export async function openPortal(): Promise<ActionResult<{ url: string }>> {
  try {
    const { orgId } = await requireRole(ADMIN_ROLES);
    if (!stripeConfigured()) return { ok: false, error: "Billing is not configured yet." };
    const { data: sub } = await createAdminClient().from("subscriptions").select("stripe_customer_id").eq("organization_id", orgId).single();
    if (!sub?.stripe_customer_id) return { ok: false, error: "No billing account yet. Subscribe to a paid plan first." };
    const s = await stripe().billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${appUrl()}/billing` });
    return { ok: true, data: { url: s.url } };
  } catch (e) { return fail(e); }
}

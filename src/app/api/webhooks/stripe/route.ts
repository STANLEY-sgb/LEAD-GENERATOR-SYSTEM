import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const mapStatus = (s: Stripe.Subscription.Status) =>
  s === "active" ? "active" : s === "trialing" ? "trialing" : s === "past_due" || s === "unpaid" ? "past_due" : s === "canceled" || s === "incomplete_expired" ? "canceled" : "past_due";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return NextResponse.json({ error: "not configured" }, { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try { event = stripe().webhooks.constructEvent(raw, sig, secret); } // verifies signature + timestamp tolerance
  catch { return NextResponse.json({ error: "invalid signature" }, { status: 400 }); }

  const admin = createAdminClient();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const orgId = s.client_reference_id ?? s.metadata?.organization_id;
        if (orgId) await admin.from("subscriptions").update({ plan_id: s.metadata?.plan_id ?? "growth", stripe_customer_id: s.customer as string, stripe_subscription_id: s.subscription as string, status: "active", updated_at: new Date().toISOString() }).eq("organization_id", orgId);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.organization_id;
        if (!orgId) break;
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end ?? sub.items.data[0]?.current_period_end;
        const deleted = event.type === "customer.subscription.deleted";
        await admin.from("subscriptions").update({
          status: deleted ? "canceled" : mapStatus(sub.status), ...(deleted ? { plan_id: "starter" } : sub.metadata?.plan_id ? { plan_id: sub.metadata.plan_id } : {}),
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null, updated_at: new Date().toISOString(),
        }).eq("organization_id", orgId);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const { data: sub } = await admin.from("subscriptions").select("organization_id").eq("stripe_customer_id", inv.customer as string).maybeSingle();
        if (sub) {
          await admin.from("invoices").upsert({ organization_id: sub.organization_id, stripe_invoice_id: inv.id, amount_cents: inv.amount_paid || inv.amount_due, currency: inv.currency, status: inv.status ?? "unknown", hosted_url: inv.hosted_invoice_url ?? null }, { onConflict: "stripe_invoice_id" });
          if (event.type === "invoice.payment_failed") await admin.from("subscriptions").update({ status: "past_due" }).eq("organization_id", sub.organization_id);
        }
        break;
      }
    }
  } catch {
    return NextResponse.json({ error: "handler failed" }, { status: 500 }); // Stripe retries with backoff
  }
  return NextResponse.json({ received: true });
}

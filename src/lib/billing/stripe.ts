import "server-only";
import Stripe from "stripe";

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY).");
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}

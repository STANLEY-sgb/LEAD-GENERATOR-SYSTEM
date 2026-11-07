import "server-only";
import { z } from "zod";
import type { LeadInput } from "@/lib/leads/ingest";

export interface DiscoveryQuery { keywords: string[]; location?: string; limit: number }

/** Every data source is an isolated connector: config, status, search, rate-limit handling, normalization, health. */
export interface Connector {
  id: string; name: string; description: string; kind: "discovery" | "inbound";
  requiredEnv: string[]; permissions: string[]; setup: string;
  configured(): boolean;
  search?(q: DiscoveryQuery): Promise<LeadInput[]>;
  health?(): Promise<{ ok: boolean; message: string }>;
}
export class RateLimitedError extends Error {}

// ---- Circuit breaker (per process): open after 5 consecutive failures, retry after 60s ----
const breaker = new Map<string, { fails: number; openUntil: number }>();
export async function guarded<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const b = breaker.get(id) ?? { fails: 0, openUntil: 0 };
  if (Date.now() < b.openUntil) throw new Error(`Connector ${id} is temporarily disabled after repeated failures`);
  try {
    const r = await fn();
    breaker.set(id, { fails: 0, openUntil: 0 });
    return r;
  } catch (e) {
    const fails = b.fails + 1;
    breaker.set(id, { fails, openUntil: fails >= 5 ? Date.now() + 60_000 : 0 });
    throw e;
  }
}

const placesSchema = z.object({
  places: z.array(z.object({
    id: z.string(), displayName: z.object({ text: z.string() }).optional(), formattedAddress: z.string().optional(),
    nationalPhoneNumber: z.string().optional(), internationalPhoneNumber: z.string().optional(), websiteUri: z.string().optional(),
    primaryTypeDisplayName: z.object({ text: z.string() }).optional(),
    addressComponents: z.array(z.object({ longText: z.string(), types: z.array(z.string()) })).optional(),
  })).default([]),
});

/** Google Places API (New): public business listings via the official API. Returns businesses, not private individuals. */
const googlePlaces: Connector = {
  id: "google_places", name: "Google Places (business listings)", kind: "discovery",
  description: "Finds public business listings (name, address, phone, website) matching your keywords and location through the official Google Places API.",
  requiredEnv: ["GOOGLE_PLACES_API_KEY"], permissions: ["Public business listing data"],
  setup: "Enable 'Places API (New)' in Google Cloud, create an API key restricted to that API, set GOOGLE_PLACES_API_KEY.",
  configured: () => Boolean(process.env.GOOGLE_PLACES_API_KEY),
  async search({ keywords, location, limit }) {
    return guarded("google_places", async () => {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "content-type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.addressComponents",
        },
        body: JSON.stringify({ textQuery: `${keywords.join(" ")}${location ? ` in ${location}` : ""}`, pageSize: Math.min(limit, 20) }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429) throw new RateLimitedError("Google Places rate limit reached");
      if (!res.ok) throw new Error(`Google Places error ${res.status}`);
      const parsed = placesSchema.parse(await res.json());
      return parsed.places.map((p): LeadInput => ({
        name: p.displayName?.text ?? null, company: p.displayName?.text ?? null,
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null, website: p.websiteUri ?? null,
        country: p.addressComponents?.find((c) => c.types.includes("country"))?.longText ?? null,
        industry: p.primaryTypeDisplayName?.text ?? null, source: "google_places", sourceRef: p.id,
        attribution: "Google Places API", raw: { address: p.formattedAddress ?? null },
        consent: { status: "unknown", legalBasis: "legitimate interest (public business listing); no e-mail collected" },
      }));
    });
  },
  async health() {
    if (!process.env.GOOGLE_PLACES_API_KEY) return { ok: false, message: "GOOGLE_PLACES_API_KEY not set" };
    try { await googlePlaces.search!({ keywords: ["cafe"], limit: 1 }); return { ok: true, message: "Connected" }; }
    catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Failed" }; }
  },
};

const webForm: Connector = {
  id: "web_form", name: "Lead capture forms", kind: "inbound",
  description: "Hosted, consent-based forms you can share or embed. Every submission records consent evidence.",
  requiredEnv: [], permissions: [], setup: "Create a form under Lead capture and share its link.", configured: () => true,
};
const inboundWebhook: Connector = {
  id: "inbound_webhook", name: "Inbound webhook", kind: "inbound",
  description: "Push leads from your own systems, ad platforms' lead-form exports or Zapier-style tools via a signed HTTPS endpoint.",
  requiredEnv: ["CREDENTIAL_ENCRYPTION_KEY"], permissions: [], setup: "Generate a signing secret in Integrations and POST JSON signed with HMAC-SHA256.",
  configured: () => Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY),
};
const csv: Connector = {
  id: "csv_import", name: "CSV import", kind: "inbound",
  description: "Import leads you already hold. You must have a lawful basis for contacting them.",
  requiredEnv: [], permissions: [], setup: "Upload a CSV from the Leads page.", configured: () => true,
};

export const CONNECTORS: Connector[] = [webForm, inboundWebhook, csv, googlePlaces];
export const getConnector = (id: string) => CONNECTORS.find((c) => c.id === id);

/** Platforms that require official partner/OAuth approval. Listed honestly as not yet available. */
export const PLANNED_INTEGRATIONS = [
  { id: "meta_lead_ads", name: "Meta Lead Ads", note: "Requires Meta app review (leads_retrieval). Use the inbound webhook or CSV export meanwhile." },
  { id: "linkedin", name: "LinkedIn", note: "Requires LinkedIn Marketing/Sales partner access. Not available." },
  { id: "tiktok", name: "TikTok Lead Gen", note: "Requires TikTok for Business approval. Use CSV/webhook export meanwhile." },
  { id: "youtube", name: "YouTube", note: "Public channel data only; no individual contact data exists. Not implemented." },
  { id: "google_ads", name: "Google Ads lead forms", note: "Requires Google Ads developer token. Use webhook delivery meanwhile." },
];

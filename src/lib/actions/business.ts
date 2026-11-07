"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, MANAGER_ROLES, fail, list, requireRole, type ActionResult } from "./helpers";

const optionalUrl = z.string().trim().max(300).refine((v) => !v || /^https?:\/\/.+\..+/.test(v), "Use a full URL starting with http(s)://");

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  businessEmail: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(40),
  website: optionalUrl,
  location: z.string().trim().max(200),
  industry: z.string().trim().max(120),
  description: z.string().trim().max(4000),
  orgSize: z.string().trim().max(40),
  targetCountries: z.string(),
  preferredSources: z.string(),
});

export async function saveBusinessProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  try {
    const v = profileSchema.parse(input);
    const { supabase, orgId } = await requireRole(ADMIN_ROLES);
    const nul = (s: string) => s || null;
    const { error: e1 } = await supabase.from("business_profiles").update({
      business_email: nul(v.businessEmail), phone: nul(v.phone), website: nul(v.website), location: nul(v.location),
      industry: nul(v.industry), description: nul(v.description), org_size: nul(v.orgSize),
      target_countries: list(v.targetCountries), preferred_sources: list(v.preferredSources),
    }).eq("organization_id", orgId);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("organizations").update({ name: v.name }).eq("id", orgId);
    if (e2) throw e2;
    revalidatePath("/business-profile");
    return { ok: true };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Invalid input") : e);
  }
}

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Name is required").max(160),
  description: z.string().trim().max(3000),
  category: z.string().trim().max(120),
  priceMin: z.string().trim(),
  priceMax: z.string().trim(),
  targetAudience: z.string().trim().max(1000),
  benefits: z.string(),
  geographicAvailability: z.string(),
  keywords: z.string(),
  searchPhrases: z.string(),
  competitors: z.string(),
});

export async function saveProduct(input: z.input<typeof productSchema>): Promise<ActionResult> {
  try {
    const v = productSchema.parse(input);
    const min = v.priceMin ? Number(v.priceMin) : null;
    const max = v.priceMax ? Number(v.priceMax) : null;
    if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) throw new Error("Prices must be numbers");
    if (min !== null && max !== null && min > max) throw new Error("Minimum price cannot exceed maximum");
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    const row = {
      name: v.name, description: v.description || null, category: v.category || null, price_min: min, price_max: max,
      target_audience: v.targetAudience || null, benefits: list(v.benefits), geographic_availability: list(v.geographicAvailability),
      keywords: list(v.keywords), search_phrases: list(v.searchPhrases), competitors: list(v.competitors),
    };
    const q = v.id
      ? supabase.from("products_services").update(row).eq("id", v.id).eq("organization_id", orgId)
      : supabase.from("products_services").insert({ ...row, organization_id: orgId });
    const { error } = await q;
    if (error) throw error;
    revalidatePath("/products");
    return { ok: true };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Invalid input") : e);
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    const { supabase, orgId } = await requireRole(MANAGER_ROLES);
    // Soft delete keeps history and referential integrity for campaigns/leads.
    const { error } = await supabase.from("products_services").update({ deleted_at: new Date().toISOString() })
      .eq("id", z.string().uuid().parse(id)).eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/products");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

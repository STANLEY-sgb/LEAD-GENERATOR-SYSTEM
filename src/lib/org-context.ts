import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrgRole = "owner" | "admin" | "sales_manager" | "sales_rep" | "analyst";

/**
 * Resolves the signed-in user's active organization from the database (via RLS-protected queries).
 * Org IDs from the client are never trusted: membership rows are the source of truth.
 */
export const getOrgContext = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, logo_url, status, onboarding_completed)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const row = memberships?.[0];
  const org = row?.organizations as unknown as
    | { id: string; name: string; logo_url: string | null; status: string; onboarding_completed: boolean }
    | null
    | undefined;
  return { supabase, userId, org: org ?? null, role: (row?.role as OrgRole | undefined) ?? null };
});

export const WRITE_ROLES: OrgRole[] = ["owner", "admin", "sales_manager", "sales_rep"];

export interface Member { id: string; user_id: string; role: OrgRole; name: string; email: string | null }

/** Org members with display names (two queries: memberships and profiles have no direct FK). RLS-scoped. */
export async function getMembers(supabase: Awaited<ReturnType<typeof getOrgContext>>["supabase"], orgId: string): Promise<Member[]> {
  const { data: ms } = await supabase.from("organization_members").select("id, user_id, role").eq("organization_id", orgId).order("created_at");
  const ids = (ms ?? []).map((m) => m.user_id);
  const { data: ps } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const byId = new Map((ps ?? []).map((p) => [p.id, p]));
  return (ms ?? []).map((m) => {
    const p = byId.get(m.user_id);
    return { id: m.id, user_id: m.user_id, role: m.role as OrgRole, name: p?.full_name || p?.email || "Member", email: p?.email ?? null };
  });
}

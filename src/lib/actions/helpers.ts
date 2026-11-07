import "server-only";
import { getOrgContext, type OrgRole } from "@/lib/org-context";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export const ADMIN_ROLES: OrgRole[] = ["owner", "admin"];
export const MANAGER_ROLES: OrgRole[] = ["owner", "admin", "sales_manager"];

/** Resolves org + role from the session (never from client input) and enforces the role list. RLS re-checks in the DB. */
export async function requireRole(roles: OrgRole[]) {
  const ctx = await getOrgContext();
  if (!ctx.org || !ctx.role) throw new Error("No organization");
  if (!roles.includes(ctx.role)) throw new Error("You do not have permission to do this");
  return { supabase: ctx.supabase, userId: ctx.userId, orgId: ctx.org.id, role: ctx.role };
}

export function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

/** "a, b\nc" -> ["a","b","c"] (trimmed, de-duplicated, capped). */
export function list(s: string | undefined | null, max = 50): string[] {
  return [...new Set((s ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean))].slice(0, max);
}

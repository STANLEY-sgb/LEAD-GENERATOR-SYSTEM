import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Strict server-side gate for the platform admin area. The flag lives in profiles.is_super_admin, which clients
 * cannot modify (column grants) - it is set only with the service role. Non-admins get a 404, not a 403.
 */
export async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) notFound();
  const { data: p } = await createAdminClient().from("profiles").select("is_super_admin").eq("id", userId).maybeSingle();
  if (!p?.is_super_admin) notFound();
  return { userId, admin: createAdminClient() };
}

export async function audit(actorId: string, action: string, entity: string, entityId?: string, metadata: Record<string, unknown> = {}, orgId?: string) {
  await createAdminClient().from("audit_logs").insert({ actor_id: actorId, organization_id: orgId ?? null, action, entity, entity_id: entityId ?? null, metadata });
}

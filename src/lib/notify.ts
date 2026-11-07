import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import type { OrgRole } from "@/lib/org-context";

/** In-app notification (+ optional e-mail) for organization members, honoring each user's preferences. */
export async function notifyOrg(orgId: string, opts: {
  roles?: OrgRole[]; userIds?: string[]; kind: "high_priority_leads" | "automation_failures" | "general";
  type: string; title: string; body?: string; link?: string;
}) {
  const admin = createAdminClient();
  let q = admin.from("organization_members").select("user_id, role").eq("organization_id", orgId);
  if (opts.userIds?.length) q = q.in("user_id", opts.userIds);
  else if (opts.roles?.length) q = q.in("role", opts.roles);
  const { data: members } = await q;
  if (!members?.length) return;
  const ids = members.map((m) => m.user_id);
  const { data: prefs } = await admin.from("notification_preferences").select("*").eq("organization_id", orgId).in("user_id", ids);
  const pref = new Map((prefs ?? []).map((p) => [p.user_id, p]));
  const rows = [];
  for (const id of ids) {
    const p = pref.get(id);
    if (opts.kind !== "general" && p && p[opts.kind] === false) continue;
    if (p && p.in_app === false) continue;
    rows.push({ organization_id: orgId, user_id: id, type: opts.type, title: opts.title, body: opts.body ?? null, link: opts.link ?? null });
  }
  if (rows.length) await admin.from("notifications").insert(rows);

  if (emailConfigured()) {
    for (const id of ids) {
      const p = pref.get(id);
      if (!p || p.email === false || (opts.kind !== "general" && p[opts.kind] === false)) continue; // e-mail is opt-in via saved preferences
      const { data } = await admin.auth.admin.getUserById(id);
      if (data.user?.email) await sendEmail({ to: data.user.email, subject: opts.title, text: `${opts.body ?? ""}\n\n${process.env.NEXT_PUBLIC_APP_URL ?? ""}${opts.link ?? ""}` }).catch(() => undefined);
    }
  }
}

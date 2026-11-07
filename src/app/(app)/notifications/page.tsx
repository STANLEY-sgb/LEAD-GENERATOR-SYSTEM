import Link from "next/link";
import { getOrgContext } from "@/lib/org-context";
import { emailConfigured } from "@/lib/email";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { NotificationsView } from "./view";

export const metadata = { title: "Notifications" };

export default async function Page() {
  const { supabase, org, userId } = await getOrgContext();
  const [{ data: items }, { data: prefs }] = await Promise.all([
    supabase.from("notifications").select("id, type, title, body, link, read_at, created_at").eq("user_id", userId).eq("organization_id", org!.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("notification_preferences").select("*").eq("user_id", userId).eq("organization_id", org!.id).maybeSingle(),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Notifications" />
      <NotificationsView items={items ?? []} emailReady={emailConfigured()} prefs={{ in_app: prefs?.in_app ?? true, email: prefs?.email ?? true, sms: false, high_priority_leads: prefs?.high_priority_leads ?? true, automation_failures: prefs?.automation_failures ?? true }} />
      {(items ?? []).length === 0 && <EmptyState title="You're all caught up" body="Hot leads, assignments and automation failures show up here." />}
      <p className="text-xs text-muted">Looking for tasks? See <Link className="underline" href="/tasks">Follow-ups</Link>.</p>
    </div>
  );
}

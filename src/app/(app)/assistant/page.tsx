import { getOrgContext } from "@/lib/org-context";
import { aiProviderConfigured } from "@/lib/env";
import { PageHeader } from "@/components/ui/primitives";
import { Chat } from "./chat";

export const metadata = { title: "AI assistant" };

export default async function Page() {
  const { supabase, org, userId } = await getOrgContext();
  const { data } = await supabase.from("ai_messages").select("id, role, content").eq("organization_id", org!.id).eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="AI sales assistant" description="Knows your business profile and your workspace data only. It drafts, you decide: nothing is ever sent automatically." />
      <Chat initial={(data ?? []).reverse() as { id: string; role: "user" | "assistant"; content: string }[]} enabled={aiProviderConfigured()} />
    </div>
  );
}

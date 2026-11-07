import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org-context";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your organization" };

export default async function OnboardingPage() {
  const { org } = await getOrgContext();
  if (org) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Create your organization</h1>
        <p className="mb-6 mt-1 text-sm text-muted">This is your private workspace. You can invite teammates later.</p>
        <OnboardingForm />
      </div>
    </main>
  );
}

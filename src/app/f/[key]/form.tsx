"use client";

import { useState } from "react";
import { Button, Input, Label, Textarea } from "@/components/ui/primitives";

export function PublicLeadForm({ formKey, consentText, phone, company }: { formKey: string; consentText: string; phone: boolean; company: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy"); setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/public/forms/${formKey}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: f.get("name"), email: f.get("email"), phone: f.get("phone") ?? "", company: f.get("company") ?? "", message: f.get("message") ?? "", consent: f.get("consent") === "on", website_url: f.get("website_url") ?? "" }),
    });
    if (res.ok) return setState("done");
    setError((await res.json().catch(() => null))?.error ?? "Something went wrong");
    setState("idle");
  }

  if (state === "done") return <p role="status" className="rounded-lg bg-primary/15 p-4">Thank you! We&apos;ll be in touch soon.</p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required maxLength={160} autoComplete="name" /></div>
      <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
      {phone && <div><Label htmlFor="phone">Phone (optional)</Label><Input id="phone" name="phone" type="tel" autoComplete="tel" /></div>}
      {company && <div><Label htmlFor="company">Company (optional)</Label><Input id="company" name="company" autoComplete="organization" /></div>}
      <div><Label htmlFor="message">How can we help?</Label><Textarea id="message" name="message" maxLength={2000} /></div>
      <div aria-hidden className="absolute -left-[9999px]"><label>Leave empty<input name="website_url" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" required className="mt-1 size-4" /> <span>{consentText}</span></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Send"}</Button>
    </form>
  );
}

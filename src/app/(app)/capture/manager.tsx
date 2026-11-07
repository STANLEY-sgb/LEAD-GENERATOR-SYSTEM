"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createForm, setFormActive } from "@/lib/actions/crm";
import { Badge, Button, Card, EmptyState, Input, Label, Textarea } from "@/components/ui/primitives";

type F = { id: string; name: string; heading: string | null; public_key: string; consent_text: string; collect_phone: boolean; collect_company: boolean; active: boolean };

export function FormsManager({ forms, canManage, appUrl }: { forms: F[]; canManage: boolean; appUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const base = appUrl || (typeof window !== "undefined" ? window.location.origin : "");

  return (
    <div className="space-y-4">
      {canManage && !open && <Button onClick={() => setOpen(true)}>Create form</Button>}
      {open && (
        <Card>
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault(); const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await createForm({ name: String(f.get("name")), heading: String(f.get("heading") ?? ""), consentText: String(f.get("consent")), collectPhone: f.get("phone") === "on", collectCompany: f.get("company") === "on" });
              if (r.ok) { toast.success("Form created"); setOpen(false); router.refresh(); } else toast.error(r.error);
            });
          }}>
            <div><Label htmlFor="fn">Internal name</Label><Input id="fn" name="name" required /></div>
            <div><Label htmlFor="fh">Public heading</Label><Input id="fh" name="heading" placeholder="Request a quote" /></div>
            <div><Label htmlFor="fc">Consent wording (shown next to the checkbox)</Label><Textarea id="fc" name="consent" required defaultValue="I agree to be contacted about my enquiry by e-mail or phone. I can withdraw consent at any time." /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="phone" defaultChecked /> Ask for phone</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="company" defaultChecked /> Ask for company</label>
            <div className="flex gap-2"><Button type="submit" disabled={pending}>Create</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
          </form>
        </Card>
      )}
      {forms.length === 0 && !open ? <EmptyState title="No forms yet" body="Create a form and share its link or put it on your website. Each submission stores the consent wording, time and source as evidence." /> : forms.map((f) => {
        const url = `${base}/f/${f.public_key}`;
        return (
          <Card key={f.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{f.name}</h2><div className="flex items-center gap-2"><Badge tone={f.active ? "success" : "neutral"}>{f.active ? "Live" : "Paused"}</Badge>{canManage && <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await setFormActive(f.id, !f.active); if (r.ok) router.refresh(); else toast.error(r.error); })}>{f.active ? "Pause" : "Activate"}</Button>}</div></div>
            <p className="break-all text-sm"><a className="underline" href={url} target="_blank" rel="noreferrer">{url}</a></p>
            <details className="text-sm"><summary className="cursor-pointer text-muted">Embed on your site</summary><pre className="mt-2 overflow-x-auto rounded-lg bg-black/10 p-2 text-xs dark:bg-white/10">{`<iframe src="${url}" title="${f.name}" width="100%" height="560" style="border:0"></iframe>`}</pre></details>
          </Card>
        );
      })}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLead, importCsv } from "@/lib/actions/leads";
import { Button, Card, Input, Label, Textarea } from "@/components/ui/primitives";

export function LeadTools() {
  const [mode, setMode] = useState<null | "add" | "import">(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [basis, setBasis] = useState(false);
  const [consent, setConsent] = useState(false);

  return (
    <>
      <Button onClick={() => setMode(mode === "add" ? null : "add")}>Add lead</Button>
      <Button variant="outline" onClick={() => setMode(mode === "import" ? null : "import")}>Import CSV</Button>
      {mode && (
        <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setMode(null); }}>
          <Card className="w-full max-w-lg">
            {mode === "add" ? (
              <form className="space-y-3" onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget); const g = (k: string) => String(f.get(k) ?? "");
                start(async () => {
                  const r = await createLead({ name: g("name"), company: g("company"), email: g("email"), phone: g("phone"), website: g("website"), country: g("country"), industry: g("industry"), consentGranted: consent, consentNote: g("consentNote") });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.data?.duplicate ? "That e-mail already exists: recorded as a repeat sighting" : "Lead added and scored");
                  setMode(null); router.refresh();
                });
              }}>
                <h2 className="text-lg font-bold">Add a lead</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label htmlFor="n">Name</Label><Input id="n" name="name" required /></div><div><Label htmlFor="c">Company</Label><Input id="c" name="company" /></div>
                  <div><Label htmlFor="e">Email</Label><Input id="e" name="email" type="email" /></div><div><Label htmlFor="p">Phone</Label><Input id="p" name="phone" type="tel" /></div>
                  <div><Label htmlFor="w">Website</Label><Input id="w" name="website" /></div><div><Label htmlFor="co">Country</Label><Input id="co" name="country" /></div>
                </div>
                <div><Label htmlFor="i">Industry</Label><Input id="i" name="industry" /></div>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> This person has given consent to be contacted</label>
                {consent && <div><Label htmlFor="cn">How/when was consent given? (evidence)</Label><Input id="cn" name="consentNote" required /></div>}
                <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add lead"}</Button><Button type="button" variant="outline" onClick={() => setMode(null)}>Cancel</Button></div>
              </form>
            ) : (
              <div className="space-y-3">
                <h2 className="text-lg font-bold">Import leads from CSV</h2>
                <p className="text-sm text-muted">Columns: name, company, email, phone, website, country, industry. Up to 500 rows. Duplicates (same e-mail) are detected, never overwritten.</p>
                <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
                <Textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="…or paste CSV here" />
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={basis} onChange={(e) => setBasis(e.target.checked)} /> I confirm I have a lawful basis to hold and contact these people. Imported contacts are NOT marked as having given consent.</label>
                <div className="flex gap-2">
                  <Button disabled={pending || !csv || !basis} onClick={() => start(async () => {
                    const r = await importCsv(csv, basis);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(`Imported ${r.data!.created} new, ${r.data!.duplicates} duplicates, ${r.data!.skipped} skipped`);
                    setMode(null); setCsv(""); router.refresh();
                  })}>{pending ? "Importing…" : "Import"}</Button>
                  <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

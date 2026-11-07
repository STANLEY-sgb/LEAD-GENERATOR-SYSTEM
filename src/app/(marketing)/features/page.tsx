export const metadata = { title: "Features" };

const F = [
  ["Permitted lead discovery", "Official APIs, public business listings, consent-based forms and signed webhooks. We never bypass logins, CAPTCHAs or platform rules."],
  ["Explainable AI scoring", "A 0–100 score with a factor-by-factor explanation. Each fact is labelled verified, inferred, unverified or missing."],
  ["Lead CRM & pipeline", "Search, filter, bulk-edit and export leads. Drag-and-drop pipeline with customizable stages, notes, tasks and full activity history."],
  ["Duplicate protection", "Exact e-mail matches are merged safely; shared phones or company domains become review candidates. Nothing is auto-merged when identity is uncertain."],
  ["No-code automation", "Triggers, conditions and actions with idempotency, retry, loop and bulk-send safeguards, plus a full execution log."],
  ["Business-aware AI assistant", "Ask about your pipeline, get briefs and outreach drafts. Drafts always need human approval before anything is sent."],
  ["Teams & roles", "Owner, administrator, sales manager, sales representative and read-only analyst, enforced in the database."],
  ["Privacy by design", "Consent evidence, suppression lists, one-click unsubscribe, data export and full organization deletion."],
];

export default function Page() {
  return (
    <>
      <h1 className="text-3xl font-bold">Everything between “who might buy?” and “closed”</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">{F.map(([t, b]) => <div key={t} className="rounded-xl border border-border bg-card p-5 shadow-sm"><h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm text-muted">{b}</p></div>)}</div>
    </>
  );
}

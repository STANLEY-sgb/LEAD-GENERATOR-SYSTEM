export const metadata = { title: "Terms of service" };

export default function Page() {
  return (
    <article className="space-y-4 text-sm leading-relaxed">
      <h1 className="text-3xl font-bold">Terms of service</h1>
      <p className="rounded-lg bg-accent/15 p-3">Template provided with the platform. Have it reviewed by qualified counsel before launch.</p>
      <h2 className="text-lg font-semibold">Acceptable use</h2>
      <ul className="list-disc pl-5"><li>You may only store and contact people you have a lawful basis to contact, and you must honour opt-outs.</li><li>No unsolicited bulk marketing, no scraping that violates a platform&apos;s terms, no circumventing authentication, CAPTCHAs or privacy controls, and no collection of private or sensitive personal data.</li><li>You are responsible for compliance with anti-spam, data-protection and telecom laws in the markets you target (e.g. GDPR, CAN-SPAM, PECR, local equivalents).</li></ul>
      <h2 className="text-lg font-semibold">AI output</h2><p>Scores and summaries are automated, heuristic and may be wrong. Review before acting; AI-drafted messages require your approval.</p>
      <h2 className="text-lg font-semibold">Plans &amp; billing</h2><p>Usage limits depend on your plan and are enforced automatically. Paid plans renew until cancelled.</p>
      <h2 className="text-lg font-semibold">Suspension</h2><p>We may suspend workspaces that breach these terms or endanger the platform.</p>
      <h2 className="text-lg font-semibold">Liability</h2><p>[Limitation of liability, governing law and dispute terms to be completed by counsel.]</p>
    </article>
  );
}

export const metadata = { title: "Privacy policy" };

export default function Page() {
  return (
    <article className="space-y-4 text-sm leading-relaxed">
      <h1 className="text-3xl font-bold">Privacy policy</h1>
      <p className="rounded-lg bg-accent/15 p-3">Template provided with the platform. Have it reviewed by qualified counsel and complete the bracketed company details before launch.</p>
      <h2 className="text-lg font-semibold">Who we are</h2><p>[Company name, address, registration number] (“we”) operates LeadPilot. Contact: <code>NEXT_PUBLIC_CONTACT_EMAIL</code>.</p>
      <h2 className="text-lg font-semibold">Two roles</h2><p>For account holders we are the <b>controller</b> of account data. For leads that customers store in their workspace, the customer is the controller and we act as <b>processor</b>.</p>
      <h2 className="text-lg font-semibold">What we collect</h2><p>Account details (name, e-mail), workspace content customers add, usage and security logs. Lead records contain only what the customer or the lead supplied, or what an official API/public listing provides, with the source recorded.</p>
      <h2 className="text-lg font-semibold">Why (legal bases)</h2><p>Contract (providing the service), legitimate interests (security, fraud prevention) and consent where required (e.g. form submissions, marketing).</p>
      <h2 className="text-lg font-semibold">Your rights</h2><p>Access, correction, deletion, restriction, portability and objection. Customers can export and delete workspace data in Settings; individuals can use the unsubscribe link in any message or contact us. Opt-outs are honoured via a suppression list.</p>
      <h2 className="text-lg font-semibold">Security &amp; retention</h2><p>Data is isolated per organization with database row-level security, credentials are encrypted, and access is logged. Data is retained while the account is active and deleted on organization deletion, subject to legal obligations.</p>
      <h2 className="text-lg font-semibold">Sub-processors</h2><p>Hosting (Vercel), database/auth (Supabase), payments (Stripe), e-mail (Resend) and AI providers (OpenAI/Anthropic) when enabled.</p>
    </article>
  );
}

export const metadata = { title: "Contact" };

export default function Page() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <article className="space-y-4">
      <h1 className="text-3xl font-bold">Contact us</h1>
      {email ? <p>Email <a className="font-semibold underline" href={`mailto:${email}`}>{email}</a> for sales, support or privacy requests (access, correction, deletion).</p>
        : <p className="rounded-lg bg-accent/15 p-3 text-sm">Contact details have not been configured yet. Set <code>NEXT_PUBLIC_CONTACT_EMAIL</code>.</p>}
    </article>
  );
}

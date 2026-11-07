import "server-only";

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

/** Transactional e-mail through Resend. Throws if unconfigured so callers surface an honest failure. */
export async function sendEmail(args: { to: string; subject: string; text: string; headers?: Record<string, string> }) {
  if (!emailConfigured()) throw new Error("Email is not configured (RESEND_API_KEY and EMAIL_FROM).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [args.to], subject: args.subject, text: args.text, headers: args.headers }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}`);
}

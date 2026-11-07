import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const k = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!k) throw new Error("CREDENTIAL_ENCRYPTION_KEY is not set (generate one: `openssl rand -base64 32`).");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  return buf;
}
export const encryptionConfigured = () => {
  try { key(); return true; } catch { return false; }
};

/** AES-256-GCM. Output: base64(iv ‖ tag ‖ ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
export function decrypt(payload: string): string {
  const b = Buffer.from(payload, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

export function hmacHex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Stateless signed token (used for unsubscribe links). Signed with the encryption key. */
export function signToken(payload: string): string {
  return `${Buffer.from(payload).toString("base64url")}.${hmacHex(key().toString("hex"), payload)}`;
}
export function verifyToken(token: string): string | null {
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const payload = Buffer.from(p, "base64url").toString();
  return safeEqual(sig, hmacHex(key().toString("hex"), payload)) ? payload : null;
}

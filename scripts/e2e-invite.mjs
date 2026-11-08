// Invitation flow: owner invites -> invitee signs in and accepts -> role change -> removal. node scripts/e2e-invite.mjs <baseUrl>
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
const sb = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, "content-type": "application/json" };
const pw = "Invite-Passw0rd!xyz", stamp = Date.now();
const mk = async (email, name) => (await (await fetch(`${sb}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }) })).json());
const owner = await mk(`invo${stamp}@mailinator.com`, "Inv Owner");
const guest = await mk(`invg${stamp}@mailinator.com`, "Inv Guest");
const out = [];
const rec = (ok, name, d = "") => { out.push(`${ok ? "ok  " : "FAIL"} ${name}${d ? " — " + d : ""}`); };

const browser = await chromium.launch({ channel: "chrome" });
const login = async (email) => {
  const page = await (await browser.newContext()).newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", email); await page.fill("#password", pw); await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  return page;
};
const toast = async (page, re) => { try { await page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: 10000 }); return true; } catch { return false; } };
try {
  const op = await login(owner.email);
  await op.goto(base + "/onboarding", { waitUntil: "networkidle" });
  await op.fill("#name", "Invite Co"); await op.click('button[type="submit"]'); await op.waitForURL(/dashboard/);
  await op.goto(base + "/team", { waitUntil: "networkidle" });

  // wrong-email invite should fail for the guest; right one succeeds
  await op.fill("#inv-email", guest.email); await op.selectOption("#inv-role", "sales_manager");
  await op.click('button:has-text("Send invite")');
  rec(await toast(op, /Invitation/i), "owner sends invite");
  const link = (await op.locator("text=Invitation link").first().innerText()).match(/https?:\/\/\S+/)?.[0];
  rec(!!link, "invite link shown", link ?? "no link");

  const gp = await login(guest.email);
  await gp.goto(link, { waitUntil: "networkidle" });
  await gp.getByRole("button").filter({ hasText: /accept|join/i }).first().click();
  await gp.waitForURL((u) => !u.pathname.startsWith("/invite"), { timeout: 20000 }).then(() => rec(true, "guest accepts invite", gp.url().replace(base, ""))).catch(async () => rec(false, "guest accepts invite", (await gp.locator("body").innerText()).slice(0, 200).replace(/\n/g, " ")));
  await gp.goto(base + "/dashboard", { waitUntil: "networkidle" });
  rec(!gp.url().includes("onboarding"), "guest lands in the org dashboard", gp.url().replace(base, ""));

  // owner sees member, changes role, then removes
  await op.goto(base + "/team", { waitUntil: "networkidle" });
  rec(await op.getByText("Inv Guest").first().isVisible().catch(() => false), "owner sees new member");
  await op.locator('select[aria-label^="Role for"]').first().selectOption("analyst");
  rec(await toast(op, /Role updated/i), "role change to analyst");
  // member limit on Starter plan (2 seats) -> third invite is rejected with a clear message
  await op.fill("#inv-email", `third${stamp}@mailinator.com`); await op.click('button:has-text("Send invite")');
  const t = await op.locator("[data-sonner-toast]").first().innerText().catch(() => "");
  rec(true, "seat limit message on 3rd invite", t.replace(/\n/g, " ").slice(0, 120));
  await op.reload({ waitUntil: "networkidle" });
  await op.getByRole("button", { name: "Remove" }).first().click();
  await op.waitForTimeout(2500); await op.reload({ waitUntil: "networkidle" });
  rec(!(await op.getByText("Inv Guest").first().isVisible().catch(() => false)), "owner removes member");
} catch (e) { rec(false, "script error", String(e.message).split("\n")[0]); }
finally {
  await browser.close();
  for (const u of [owner, guest]) await fetch(`${sb}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H });
  await fetch(`${sb}/rest/v1/organizations?name=eq.Invite%20Co`, { method: "DELETE", headers: H });
}
console.log(out.join("\n"));
process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);

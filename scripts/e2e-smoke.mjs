// Browser smoke test against a running deployment: node scripts/e2e-smoke.mjs <baseUrl>
// Needs .env.local (service role) to create/delete a confirmed throwaway user. Never run against data you care about.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
const sb = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, "content-type": "application/json" };
const email = `e2e${Date.now()}@mailinator.com`;
const password = "E2e-Passw0rd!xyz";
const problems = [];

const created = await (await fetch(`${sb}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "E2E Tester" } }) })).json();

const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let where = "start";
page.on("pageerror", (e) => problems.push(`[${where}] pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") problems.push(`[${where}] console: ${m.text().slice(0, 200)}`); });
page.on("response", (r) => { if (r.status() >= 500) problems.push(`[${where}] HTTP ${r.status()} ${r.url()}`); });

async function visit(path) {
  where = path;
  const r = await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => { problems.push(`[${path}] goto: ${e.message}`); return null; });
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
  if (/Application error|Something went wrong|Internal Server Error|digest/i.test(body)) problems.push(`[${path}] error page: ${body.slice(0, 160).replace(/\n/g, " ")}`);
  console.log(String(r?.status() ?? "ERR").padEnd(4), page.url().replace(base, "") || "/", "<-", path);
}

try {
  // sign in through the real form
  where = "/login";
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => problems.push("login did not leave /login"));
  console.log("after login:", page.url().replace(base, ""));

  await page.goto(base + "/dashboard", { waitUntil: "networkidle" });
  if (page.url().includes("/onboarding")) {
    where = "/onboarding";
    await page.fill("#name", "E2E Test Company");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 30000 }).catch(() => problems.push("onboarding did not reach /dashboard"));
    console.log("after onboarding:", page.url().replace(base, ""));
  }

  for (const p of ["/dashboard", "/business-profile", "/products", "/icp", "/leads", "/pipeline", "/discovery", "/capture", "/tasks", "/team", "/campaigns", "/automation", "/assistant", "/analytics", "/integrations", "/billing", "/notifications", "/settings", "/admin"]) await visit(p);
} finally {
  await browser.close();
  await fetch(`${sb}/auth/v1/admin/users/${created.id}`, { method: "DELETE", headers: H });
}
console.log(problems.length ? "\nPROBLEMS:\n" + [...new Set(problems)].join("\n") : "\nNo problems found");
process.exit(problems.length ? 1 : 0);

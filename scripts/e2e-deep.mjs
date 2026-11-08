// Exhaustive UI sweep: node scripts/e2e-deep.mjs <baseUrl> [role]
// Seeds a throwaway org with data, then loads every page, checks every internal link and clicks every button,
// recording error toasts, error pages, failed requests and JS errors. Roles: owner (default), sales_rep, analyst, admin.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const role = process.argv[3] ?? "owner";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
const sb = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, "content-type": "application/json" };
const pw = "Deep-Passw0rd!xyz";
const stamp = Date.now();
const mk = async (email, name) => (await (await fetch(`${sb}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }) })).json());
const owner = await mk(`deepo${stamp}@mailinator.com`, "Deep Owner");
const member = role === "owner" ? null : await mk(`deepm${stamp}@mailinator.com`, "Deep Member");
const users = [owner, member].filter(Boolean);
let orgIdForCleanup = null;

const findings = [];
const seen = new Set();
const note = (kind, where, msg) => { const k = `${kind}|${where}|${msg}`; if (!seen.has(k)) { seen.add(k); findings.push({ kind, where, msg }); } };

const browser = await chromium.launch({ channel: "chrome" });
let where = "setup";
async function newSession(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => note("js-error", where, e.message.slice(0, 200)));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 500) note("http-5xx", where, `${r.status()} ${r.request().method()} ${u.replace(base, "").slice(0, 100)}`);
    else if (r.status() >= 400 && u.startsWith(base) && !u.includes("_next/")) note("http-4xx", where, `${r.status()} ${r.request().method()} ${u.replace(base, "").slice(0, 100)}`);
  });
  page.on("dialog", (d) => d.dismiss());
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", email); await page.fill("#password", pw);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  return page;
}
const go = (page, p) => page.goto(base + p, { waitUntil: "networkidle", timeout: 60000 });
const toasts = (page) => page.locator("[data-sonner-toast]").evaluateAll((els) => els.map((e) => ({ type: e.getAttribute("data-type"), text: e.innerText.slice(0, 200) })));

try {
  // ---- seed (as owner) ----
  const op = await newSession(owner.email);
  where = "seed";
  await go(op, "/onboarding");
  await op.fill("#name", "Deep Sweep Co"); await op.click('button[type="submit"]'); await op.waitForURL(/dashboard/);
  const orgId = (await (await fetch(`${sb}/rest/v1/organizations?select=id&created_by=eq.${owner.id}`, { headers: H })).json())[0].id;
  orgIdForCleanup = orgId;
  if (member) {
    await fetch(`${sb}/rest/v1/organization_members`, { method: "POST", headers: H, body: JSON.stringify({ organization_id: orgId, user_id: member.id, role }) });
  }
  await go(op, "/leads");
  await op.click('button:has-text("Add lead")');
  await op.fill("#n", "Seed Lead"); await op.fill("#c", "Seed Co"); await op.fill("#e", "seed@seedco.example"); await op.fill("#co", "Kenya");
  await op.click('button[type="submit"]:has-text("Add lead")'); await op.waitForTimeout(2500);
  await go(op, "/capture"); await op.click('button:has-text("Create form")'); await op.fill("#fn", "Seed form"); await op.click('button[type="submit"]:has-text("Create")'); await op.waitForTimeout(2000);
  await go(op, "/products"); await op.click('button:has-text("Add")'); await op.fill("#name", "Seed product"); await op.click('button:has-text("Save")'); await op.waitForTimeout(2000);
  await go(op, "/automation"); await op.getByRole("button", { name: /^Template:/ }).first().click(); await op.getByRole("button", { name: "Save workflow" }).click(); await op.waitForTimeout(2000);
  await go(op, "/team"); await op.fill("#inv-email", "pending@mailinator.com"); await op.click('button:has-text("Send invite")'); await op.waitForTimeout(2500);
  const leadId = (await (await fetch(`${sb}/rest/v1/leads?select=id&organization_id=eq.${orgId}&limit=1`, { headers: H })).json())[0]?.id;
  if (!leadId) note("seed", "leads", "seed lead was not created");
  const formKey = (await (await fetch(`${sb}/rest/v1/lead_forms?select=public_key&organization_id=eq.${orgId}&limit=1`, { headers: H })).json())[0]?.public_key;

  // ---- sweep as the requested role ----
  const page = role === "owner" ? op : await newSession(member.email);
  const routes = [...(formKey ? [`/f/${formKey}`] : []), "/dashboard", "/leads", ...(leadId ? [`/leads/${leadId}`] : []), "/pipeline", "/tasks", "/discovery", "/capture", "/campaigns", "/automation", "/assistant", "/analytics", "/business-profile", "/products", "/icp", "/integrations", "/team", "/billing", "/notifications", "/settings", "/pricing", "/features", "/about", "/contact", "/privacy", "/terms"];
  const checkedLinks = new Set();
  for (const route of routes) {
    where = route;
    await go(page, route);
    const text = await page.locator("body").innerText();
    if (/Application error|Something went wrong|Internal Server Error|This page couldn.t load|Unhandled/i.test(text)) note("error-page", route, text.slice(0, 160).replace(/\n/g, " "));
    if (page.url().includes("/login") || page.url().includes("/onboarding")) note("redirect", route, `redirected to ${page.url().replace(base, "")}`);

    // every internal link
    const hrefs = await page.locator("a[href]").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
    for (const h of hrefs) {
      if (!h || h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("tel:") || /^https?:/.test(h) && !h.startsWith(base) || checkedLinks.has(h)) continue;
      checkedLinks.add(h);
      const res = await page.request.get(h.startsWith("http") ? h : base + h, { maxRedirects: 5 }).catch((e) => ({ status: () => 0, _e: e.message }));
      if (res.status() >= 400 || res.status() === 0) note("broken-link", route, `${h} -> ${res.status()}`);
    }

    // every button (re-load the page for each so state is fresh)
    const count = await page.locator("main button:visible, main [role=tab]:visible, main summary:visible").count();
    for (let i = 0; i < count; i++) {
      await go(page, route);
      const btn = page.locator("main button:visible, main [role=tab]:visible, main summary:visible").nth(i);
      const label = ((await btn.innerText().catch(() => "")) || (await btn.getAttribute("aria-label").catch(() => "")) || `#${i}`).trim().replace(/\n/g, " ").slice(0, 40);
      if (!(await btn.isEnabled().catch(() => false))) continue;
      if (/^(sign out|log out)$/i.test(label)) continue;
      where = `${route} [${label}]`;
      const before = page.url();
      await btn.click({ timeout: 4000 }).catch((e) => note("click-failed", where, e.message.split("\n")[0].slice(0, 100)));
      await page.waitForTimeout(1200);
      for (const t of await toasts(page)) if (t.type === "error" || /failed|error|unexpected|denied|not allowed|invalid/i.test(t.text)) note("toast", where, t.text.replace(/\n/g, " "));
      const body = await page.locator("body").innerText().catch(() => "");
      if (/Application error|Something went wrong|Internal Server Error/i.test(body)) note("error-page", where, "error page after click");
      if (page.url() !== before) { /* navigation is fine */ }
    }
  }

  // ---- submit-type checks on key forms (owner only) ----
  if (role === "owner") {
    where = "api";
    for (const [p, b] of [["/api/health"], ["/api/leads/export"], ["/api/org/export"]]) {
      const r = await op.request.get(base + p); if (r.status() >= 400) note("api", p, String(r.status()));
    }
  }
} finally {
  await browser.close();
  for (const u of users) await fetch(`${sb}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H });
  // remove orphaned test orgs (users deleted)
  if (orgIdForCleanup) await fetch(`${sb}/rest/v1/organizations?id=eq.${orgIdForCleanup}`, { method: "DELETE", headers: H });
}
console.log(`role=${role}: ${findings.length} findings`);
for (const f of findings) console.log(`- [${f.kind}] ${f.where}: ${f.msg}`);
process.exit(findings.length ? 1 : 0);

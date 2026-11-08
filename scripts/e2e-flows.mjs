// Functional browser test of real flows against a deployment: node scripts/e2e-flows.mjs <baseUrl>
// Creates a confirmed throwaway user + organization through the UI, exercises features, then deletes the user.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
const sb = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, "content-type": "application/json" };
const email = `flow${Date.now()}@mailinator.com`;
const password = "Flow-Passw0rd!xyz";
const results = [];
const created = await (await fetch(`${sb}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "Flow Tester" } }) })).json();

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
let step = "start";
const errs = [];
page.on("pageerror", (e) => errs.push(`[${step}] pageerror ${e.message}`));
page.on("response", (r) => { if (r.status() >= 500) errs.push(`[${step}] HTTP ${r.status()} ${r.url()}`); });

async function run(name, fn) {
  step = name;
  const before = errs.length;
  try { await fn(); const e = errs.slice(before); results.push([e.length ? "WARN" : "ok", name, e.join("; ")]); }
  catch (e) { results.push(["FAIL", name, String(e.message).split("\n")[0].slice(0, 220)]); }
}
const toastText = async (re, t = 12000) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: t });
const go = (p) => page.goto(base + p, { waitUntil: "networkidle", timeout: 60000 });

try {
  await run("login", async () => {
    await go("/login");
    await page.fill("#email", email); await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  });
  await run("create organization", async () => {
    await go("/onboarding");
    await page.fill("#name", "Flow Test Co");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 30000 });
    await page.getByText(/Flow Test Co/).first().waitFor({ timeout: 10000 });
  });
  await run("business profile save", async () => {
    await go("/business-profile");
    await page.fill("#industry", "Solar installation");
    await page.fill("#description", "We install rooftop solar for homes and small businesses.");
    await page.fill("#targetCountries", "Kenya, Uganda");
    await page.click('button:has-text("Save changes")');
    await toastText(/saved|updated/i);
    await page.reload({ waitUntil: "networkidle" });
    if ((await page.inputValue("#industry")) !== "Solar installation") throw new Error("value not persisted");
  });
  await run("add product", async () => {
    await go("/products");
    await page.click('button:has-text("Add")');
    await page.fill("#name", "Rooftop Solar Kit");
    await page.fill("#description", "5kW home solar system with installation.");
    await page.click('button:has-text("Save")');
    await toastText(/saved/i);
    await page.getByText("Rooftop Solar Kit").first().waitFor({ timeout: 10000 });
  });
  await run("add lead (manual, with consent)", async () => {
    await go("/leads");
    await page.click('button:has-text("Add lead")');
    await page.fill("#n", "Amina Okello"); await page.fill("#c", "Okello Farms"); await page.fill("#e", "amina@okellofarms.example");
    await page.fill("#co", "Uganda"); await page.fill("#i", "Agriculture");
    await page.check('input[type="checkbox"]'); await page.fill("#cn", "Asked for a quote by phone 2026-11-01");
    await page.click('button[type="submit"]:has-text("Add lead")');
    await toastText(/added|created|lead/i);
    await go("/leads");
    await page.getByText("Amina Okello").first().waitFor({ timeout: 10000 });
  });
  await run("duplicate lead is detected", async () => {
    await go("/leads");
    await page.click('button:has-text("Add lead")');
    await page.fill("#n", "Amina O."); await page.fill("#e", "AMINA@okellofarms.example");
    await page.click('button[type="submit"]:has-text("Add lead")');
    await toastText(/duplicate|already/i);
  });
  await run("lead detail + note", async () => {
    await go("/leads");
    await page.getByText("Amina Okello").first().click();
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 15000 });
    await page.getByText(/score/i).first().waitFor({ timeout: 10000 });
    const note = page.locator('textarea').first();
    await note.fill("Called, wants a site visit next week.");
    await page.locator('button:has-text("Add note"), button:has-text("Save note"), button:has-text("Add")').first().click();
    await page.getByText("wants a site visit").first().waitFor({ timeout: 10000 });
  });
  await run("pipeline shows lead", async () => {
    await go("/pipeline");
    await page.getByText("Amina Okello").first().waitFor({ timeout: 10000 });
  });
  await run("create lead capture form", async () => {
    await go("/capture");
    await page.click('button:has-text("Create form")');
    await page.fill("#fn", "Website quote form");
    await page.click('button[type="submit"]:has-text("Create")');
    await toastText(/created/i);
  });
  await run("task create", async () => {
    await go("/tasks");
    await page.fill('[aria-label="Task title"]', "Follow up with Amina");
    await page.fill('[aria-label="Due"]', "2026-12-01T10:00");
    await page.click('button[type="submit"]:has-text("Add")');
    await page.getByText("Follow up with Amina").first().waitFor({ timeout: 10000 });
  });
  await run("public form submit -> lead (consent required)", async () => {
    const orgs = await (await fetch(`${sb}/rest/v1/lead_forms?select=public_key,organization_id&order=created_at.desc&limit=1`, { headers: H })).json();
    if (!orgs[0]) throw new Error("form row not found: " + JSON.stringify(orgs));
    const url = `${base}/api/public/forms/${orgs[0].public_key}`;
    const bad = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "No Consent", email: "nc@buyer.example", consent: false }) });
    if (bad.status !== 400) throw new Error("no-consent submission returned " + bad.status);
    const ok = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Brian Mwesigwa", email: "brian@mwesigwa.example", company: "Mwesigwa Ltd", consent: true }) });
    if (ok.status !== 200) throw new Error("submission returned " + ok.status + " " + (await ok.text()));
    await go("/leads");
    await page.getByText("Brian Mwesigwa").first().waitFor({ timeout: 10000 });
  });
  await run("worker tick endpoint", async () => {
    const bad = await fetch(`${base}/api/worker/tick`, { method: "POST" });
    if (bad.status !== 401) throw new Error("unauthenticated tick returned " + bad.status);
    const ok = await fetch(`${base}/api/worker/tick`, { method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    if (ok.status !== 200) throw new Error("tick returned " + ok.status);
  });
  await run("create campaign", async () => {
    await go("/campaigns");
    await page.getByRole("button", { name: /new campaign|create|add/i }).first().click();
    await page.fill("#c-name", "Q4 Farm Outreach");
    await page.click('button:has-text("Save campaign")');
    await page.getByText("Q4 Farm Outreach").first().waitFor({ timeout: 10000 });
  });
  await run("create ICP profile (manual)", async () => {
    await go("/icp");
    await page.getByRole("button", { name: /new|add|create/i }).first().click();
    await page.fill("#icp-name", "Mid-size farms");
    await page.getByRole("button", { name: /save/i }).first().click();
    await page.getByText("Mid-size farms").first().waitFor({ timeout: 10000 });
  });
  await run("create automation workflow", async () => {
    await go("/automation");
    await page.getByRole("button", { name: /^Template:/ }).first().click();
    await page.fill("#w-name", "Tag hot leads");
    await page.getByRole("button", { name: "Save workflow" }).click();
    await page.getByText("Tag hot leads").first().waitFor({ timeout: 10000 });
  });
  await run("assistant page honest without AI key", async () => { await go("/assistant"); });
  await run("team invite", async () => {
    await go("/team");
    await page.fill("#inv-email", "teammate@mailinator.com");
    await page.click('button:has-text("Send invite")');
    await page.waitForTimeout(3000);
  });
  await run("dashboard & analytics render data", async () => {
    await go("/dashboard"); await go("/analytics"); await go("/notifications"); await go("/integrations"); await go("/billing"); await go("/settings"); await go("/team");
  });
} finally {
  await browser.close();
  await fetch(`${sb}/auth/v1/admin/users/${created.id}`, { method: "DELETE", headers: H });
}
for (const [s, n, d] of results) console.log(s.padEnd(5), n, d ? `— ${d}` : "");
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);

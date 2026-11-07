// Minimal concurrency probe for the public form endpoint.
// Usage: node scripts/load-test.mjs https://your-app.example/f-key-here 200 20
// (formKey, total requests, concurrency). Use a staging deployment; every accepted request creates a lead.
const [base, key, total = "100", conc = "10"] = process.argv.slice(2);
if (!base || !key) { console.error("usage: node scripts/load-test.mjs <baseUrl> <formKey> [total] [concurrency]"); process.exit(1); }
let sent = 0, ok = 0, limited = 0, failed = 0; const lat = [];
async function worker() {
  while (sent < Number(total)) {
    const i = sent++;
    const t = performance.now();
    try {
      const r = await fetch(`${base}/api/public/forms/${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `Load ${i}`, email: `load${i}-${Date.now()}@example.test`, consent: true }) });
      if (r.ok) ok++; else if (r.status === 429) limited++; else failed++;
    } catch { failed++; }
    lat.push(performance.now() - t);
  }
}
await Promise.all(Array.from({ length: Number(conc) }, worker));
lat.sort((a, b) => a - b);
console.log({ total, ok, rateLimited: limited, failed, p50: Math.round(lat[Math.floor(lat.length * 0.5)]), p95: Math.round(lat[Math.floor(lat.length * 0.95)]) });

import { describe, expect, it } from "vitest";
import { domainFromEmail, escapeCsvCell, normalizeDomain, normalizeEmail, normalizePhone } from "./normalize";
import { DEFAULT_CONFIG, scoreLead, type ScoringContext } from "./scoring";

const ctx: ScoringContext = { keywords: ["solar", "inverter"], targetCountries: ["Uganda", "Kenya"], industries: ["construction"], buyerRoles: ["procurement"], segments: [], intentSignals: ["tender"] };
const now = new Date("2026-01-10T00:00:00Z");

describe("normalize", () => {
  it("emails", () => { expect(normalizeEmail("  Jo@X.COM ")).toBe("jo@x.com"); expect(normalizeEmail("nope")).toBeNull(); });
  it("phones", () => { expect(normalizePhone("+256 (700) 123-456")).toBe("+256700123456"); expect(normalizePhone("123")).toBeNull(); });
  it("domains", () => { expect(normalizeDomain("https://www.Acme.com/about")).toBe("acme.com"); expect(normalizeDomain("localhost")).toBeNull(); });
  it("ignores free-mail domains", () => { expect(domainFromEmail("a@gmail.com")).toBeNull(); expect(domainFromEmail("a@acme.io")).toBe("acme.io"); });
  it("neutralises CSV formula injection", () => { expect(escapeCsvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)"); expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""'); });
});

describe("scoreLead", () => {
  const strong = { name: "Jane", company: "BuildCo construction", email: "j@buildco.com", phone: "+256700123456", website: "buildco.com", country: "Uganda", industry: "Construction", source: "web_form", discoveredAt: now, intentText: "Need a solar quote, procurement lead", title: "procurement" };
  it("scores a strong inbound lead as hot with explanations", () => {
    const r = scoreLead(strong, ctx, DEFAULT_CONFIG, now);
    expect(r.qualification).toBe("hot");
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.factors).toHaveLength(8);
    expect(r.factors.every((f) => f.detail.length > 0)).toBe(true);
  });
  it("scores an empty out-of-market lead low and flags missing info", () => {
    const r = scoreLead({ name: "X", source: "csv_import", discoveredAt: "2020-01-01", country: "Norway" }, ctx, DEFAULT_CONFIG, now);
    expect(["cold", "unqualified"]).toContain(r.qualification);
    expect(r.explanation).toMatch(/Missing information/);
  });
  it("never marks contact details as verified", () => {
    const r = scoreLead(strong, ctx, DEFAULT_CONFIG, now);
    expect(r.factors.find((f) => f.key === "completeness")!.evidence).not.toBe("verified");
  });
  it("respects custom weights and stays within 0-100", () => {
    const r = scoreLead(strong, ctx, { ...DEFAULT_CONFIG, weights: { ...DEFAULT_CONFIG.weights, geography: 0, relevance: 1000 } }, now);
    expect(r.score).toBeGreaterThanOrEqual(0); expect(r.score).toBeLessThanOrEqual(100);
  });
});

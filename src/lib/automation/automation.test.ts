import { describe, expect, it } from "vitest";
import { evalConditions, type LeadFacts } from "./conditions";
import { isPrivateIp } from "./ssrf";

const facts: LeadFacts = { score: 85, qualification: "hot", country: "Uganda", industry: "Construction", source: "web_form", status: "new",
  consent_status: "granted", email: "a@b.com", phone: null, contacted: false, tags: ["vip"], stage: "New Lead" };

describe("conditions", () => {
  it("numeric comparisons", () => {
    expect(evalConditions(facts, [{ field: "score", op: "gt", value: 80 }])).toBe(true);
    expect(evalConditions(facts, [{ field: "score", op: "lt", value: 80 }])).toBe(false);
  });
  it("text is case-insensitive", () => { expect(evalConditions(facts, [{ field: "country", op: "eq", value: "uganda" }])).toBe(true); });
  it("booleans, tags and AND semantics", () => {
    expect(evalConditions(facts, [{ field: "has_email", op: "is_true" }, { field: "has_phone", op: "is_false" }, { field: "tag", op: "eq", value: "VIP" }])).toBe(true);
    expect(evalConditions(facts, [{ field: "has_email", op: "is_true" }, { field: "contacted", op: "is_true" }])).toBe(false);
  });
  it("missing values never satisfy numeric conditions", () => {
    expect(evalConditions({ ...facts, score: null }, [{ field: "score", op: "gte", value: 0 }])).toBe(false);
  });
  it("empty condition list passes", () => { expect(evalConditions(facts, [])).toBe(true); });
});

describe("ssrf guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1"])("blocks %s", (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

import { describe, expect, it } from "vitest";
import { registerSchema, slugify } from "./validation";

describe("slugify", () => {
  it("produces a DB-valid slug (^[a-z0-9-]{2,60}$)", () => {
    for (const n of ["Acme Ltd.", "  ÜÑÍ!! ", "a", "x".repeat(200)]) {
      expect(slugify(n)).toMatch(/^[a-z0-9-]{2,60}$/);
    }
  });
  it("is unique across calls for the same name", () => {
    expect(slugify("Acme")).not.toBe(slugify("Acme"));
  });
});

describe("registerSchema", () => {
  it("rejects short passwords and bad emails", () => {
    expect(registerSchema.safeParse({ fullName: "Jo Doe", email: "nope", password: "short" }).success).toBe(false);
  });
  it("accepts valid input", () => {
    expect(registerSchema.safeParse({ fullName: "Jo Doe", email: "jo@x.com", password: "longenough123" }).success).toBe(true);
  });
});

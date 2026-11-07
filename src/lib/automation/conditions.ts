/** Pure, side-effect-free workflow condition evaluation (unit tested). */
export type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_true" | "is_false";
export interface Condition { field: string; op: Op; value?: string | number | boolean }
export interface LeadFacts {
  score: number | null; qualification: string; country: string | null; industry: string | null; source: string; status: string;
  consent_status: string; email: string | null; phone: string | null; contacted: boolean; tags: string[]; stage: string | null;
}

export const CONDITION_FIELDS: { key: string; label: string; type: "number" | "text" | "bool" }[] = [
  { key: "score", label: "Lead score", type: "number" }, { key: "qualification", label: "Qualification", type: "text" },
  { key: "country", label: "Country", type: "text" }, { key: "industry", label: "Industry", type: "text" },
  { key: "source", label: "Lead source", type: "text" }, { key: "status", label: "Status", type: "text" },
  { key: "stage", label: "Pipeline stage", type: "text" }, { key: "consent_status", label: "Consent", type: "text" },
  { key: "has_email", label: "Has e-mail", type: "bool" }, { key: "has_phone", label: "Has phone", type: "bool" },
  { key: "contacted", label: "Already contacted", type: "bool" }, { key: "tag", label: "Has tag", type: "text" },
];

function fieldValue(f: LeadFacts, field: string): unknown {
  switch (field) {
    case "has_email": return Boolean(f.email);
    case "has_phone": return Boolean(f.phone);
    case "tag": return f.tags;
    default: return (f as unknown as Record<string, unknown>)[field];
  }
}

export function evalCondition(facts: LeadFacts, c: Condition): boolean {
  const v = fieldValue(facts, c.field);
  const want = c.value;
  const eqText = (a: unknown, b: unknown) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
  switch (c.op) {
    case "is_true": return v === true;
    case "is_false": return v === false;
    case "eq": return Array.isArray(v) ? v.some((x) => eqText(x, want)) : eqText(v, want);
    case "neq": return Array.isArray(v) ? !v.some((x) => eqText(x, want)) : !eqText(v, want);
    case "contains": return Array.isArray(v) ? v.some((x) => eqText(x, want)) : String(v ?? "").toLowerCase().includes(String(want ?? "").toLowerCase());
    case "gt": case "gte": case "lt": case "lte": {
      if (v == null || want == null || want === "") return false;
      const a = Number(v), b = Number(want);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return c.op === "gt" ? a > b : c.op === "gte" ? a >= b : c.op === "lt" ? a < b : a <= b;
    }
    default: return false;
  }
}

/** All conditions must hold (AND). An empty list always passes. */
export const evalConditions = (facts: LeadFacts, cs: Condition[]) => cs.every((c) => evalCondition(facts, c));

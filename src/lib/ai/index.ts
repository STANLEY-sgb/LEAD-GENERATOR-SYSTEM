import "server-only";

/**
 * Provider-independent AI layer. Callers depend on `AiProvider`, never on a vendor SDK,
 * so providers can be swapped or added without touching feature code.
 */
export interface AiProvider {
  name: string;
  /** Returns the raw text of a completion; `json` asks the model for a JSON object. */
  complete(args: { system: string; prompt: string; json?: boolean; maxTokens?: number }): Promise<string>;
}

export class AiUnavailableError extends Error {
  constructor() {
    super("No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
  }
}

const openai = (key: string): AiProvider => ({
  name: "openai",
  async complete({ system, prompt, json, maxTokens = 1500 }) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  },
});

const anthropic = (key: string): AiProvider => ({
  name: "anthropic",
  async complete({ system, prompt, json, maxTokens = 1500 }) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
        max_tokens: maxTokens,
        system: json ? `${system}\nRespond with a single valid JSON object and nothing else.` : system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  },
});

export function getAiProvider(): AiProvider {
  const pref = process.env.AI_PROVIDER;
  const o = process.env.OPENAI_API_KEY;
  const a = process.env.ANTHROPIC_API_KEY;
  if (pref === "anthropic" && a) return anthropic(a);
  if (pref === "openai" && o) return openai(o);
  if (o) return openai(o);
  if (a) return anthropic(a);
  throw new AiUnavailableError();
}

/** Extracts a JSON object even if the model wrapped it in prose or code fences. */
export function parseJsonLoose(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI response contained no JSON");
  return JSON.parse(text.slice(start, end + 1));
}

// ──────────────────────────────────────────────────────────────────────
// WHAT: The only file that talks to the AI provider. Server only (holds AI_API_KEY).
// ──────────────────────────────────────────────────────────────────────

// Server-only: calls an AI model through the OpenAI-compatible "chat completions" API.
// Works with Google Gemini, Groq, OpenRouter, OpenAI and others. Set in .env.local:
//   AI_API_KEY   the provider's key (never exposed to the browser)
//   AI_BASE_URL  e.g. https://generativelanguage.googleapis.com/v1beta/openai  (Gemini, the default)
//   AI_MODEL     e.g. gemini-3.8-flash

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 110_000;

export class AiError extends Error {
  status: number;
  retryAfter?: number;
  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function aiConfigured() {
  return Boolean(process.env.AI_API_KEY);
}

export function aiModelName() {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

// Sends one prompt to the AI and returns its text answer. Throws AiError with a friendly message on problems.
export async function askAi(prompt: string): Promise<string> {
  const key = process.env.AI_API_KEY;
  if (!key) throw new AiError("AI is not set up: add AI_API_KEY to .env.local and restart.", 501);
  const base = (process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");

  const body: Record<string, unknown> = {
    model: aiModelName(),
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an expert in outcome-based education and NBA accreditation for engineering programmes. Follow the output format exactly and reply with the CSV only.",
      },
      { role: "user", content: prompt },
    ],
  };
  // "Thinking" models (e.g. newer Gemini) can take a long time; this task needs little reasoning.
  // AI_REASONING_EFFORT: low | medium | high | none | off (off = don't send the setting at all).
  const effort = process.env.AI_REASONING_EFFORT ?? (base.includes("generativelanguage.googleapis.com") ? "low" : "off");
  if (effort && effort !== "off") body.reasoning_effort = effort;

  const call = async (payload: Record<string, unknown>) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      throw new AiError(
        (e as Error).name === "AbortError"
          ? "The AI took too long to answer. Try again; if it keeps happening, set AI_REASONING_EFFORT=none or try another model."
          : `Could not reach the AI: ${(e as Error).message}`,
        504,
      );
    } finally {
      clearTimeout(timer);
    }
  };

  // Send the request (with a time limit of TIMEOUT_MS).
  let res = await call(body);
  // Some models don't accept the reasoning setting: retry once without it.
  if (res.status === 400 && "reasoning_effort" in body) {
    const text = await res.clone().text().catch(() => "");
    if (/reason|thinking/i.test(text)) {
      delete body.reasoning_effort;
      res = await call(body);
    }
  }

  // Turn provider errors into clear messages: 429 = free limit reached, 401/403 = wrong key.
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message ?? j?.[0]?.error?.message ?? text;
    } catch {}
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      throw new AiError("The AI's free-tier limit was reached. Waiting a moment usually fixes it.", 429, Number.isFinite(ra) && ra > 0 ? ra : undefined);
    }
    if (res.status === 401 || res.status === 403) throw new AiError("The AI rejected the API key. Check AI_API_KEY in .env.local.", 502);
    throw new AiError(`AI error (${res.status}): ${String(msg).slice(0, 300)}`, 502);
  }

  // The answer text is in choices[0].message.content (OpenAI-compatible format).
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new AiError("The AI returned an empty answer. Try again.", 502);
  return content;
}

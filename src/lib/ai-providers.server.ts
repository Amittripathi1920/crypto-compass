import type { ProviderId } from "./coins";

type ChatArgs = {
  provider: ProviderId;
  model: string;
  apiKey?: string | undefined;
  system: string;
  user: string;
};

type ProviderAdapter = {
  url: string;
  headers: (key: string) => Record<string, string>;
  body: (args: ChatArgs) => unknown;
  extract: (json: unknown) => string;
};

function openAiCompatible(url: string, authHeader: "bearer" | "lovable"): ProviderAdapter {
  return {
    url,
    headers: (key) =>
      authHeader === "lovable"
        ? { "Content-Type": "application/json", "Lovable-API-Key": key }
        : { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: ({ model, system, user }) => ({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
    extract: (json) => {
      const j = json as { choices?: { message?: { content?: string } }[] };
      return j.choices?.[0]?.message?.content ?? "";
    },
  };
}

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  lovable: openAiCompatible("https://ai.gateway.lovable.dev/v1/chat/completions", "lovable"),
  openai: openAiCompatible("https://api.openai.com/v1/chat/completions", "bearer"),
  groq: openAiCompatible("https://api.groq.com/openai/v1/chat/completions", "bearer"),
  google: openAiCompatible(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "bearer",
  ),
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    headers: (key) => ({
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
    body: ({ model, system, user }) => ({
      model,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: user }],
    }),
    extract: (json) => {
      const j = json as { content?: { text?: string }[] };
      return j.content?.map((c) => c.text ?? "").join("") ?? "";
    },
  },
};

export async function runChat(args: ChatArgs): Promise<string> {
  const adapter = ADAPTERS[args.provider];
  
  // Resolve key: client-provided key has priority, fall back to environment variables
  let key = args.apiKey?.trim();
  if (!key) {
    if (args.provider === "lovable") {
      key = process.env["LOVABLE_API_KEY"];
    } else if (args.provider === "groq") {
      key = process.env["GROQ_API_KEY"];
    } else if (args.provider === "openai") {
      key = process.env["OPENAI_API_KEY"];
    } else if (args.provider === "google") {
      key = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
    } else if (args.provider === "anthropic") {
      key = process.env["ANTHROPIC_API_KEY"];
    }
  }

  if (!key) {
    throw new Error(
      args.provider === "lovable"
        ? "The built-in AI is not configured."
        : `An API key is required for ${args.provider}. Please input it in the key field or configure the ${args.provider.toUpperCase()}_API_KEY environment variable.`,
    );
  }

  const res = await fetch(adapter.url, {
    method: "POST",
    headers: adapter.headers(key),
    body: JSON.stringify(adapter.body(args)),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit reached. Please try again in a moment.");
    if (res.status === 402)
      throw new Error("AI credits exhausted. Add credits or switch to your own API key.");
    if (res.status === 401 || res.status === 403)
      throw new Error("The AI provider rejected the API key.");
    console.error("AI provider error", res.status, text.slice(0, 500));
    throw new Error(`AI provider error (${res.status}).`);
  }

  const json = await res.json();
  const content = adapter.extract(json);
  if (!content) throw new Error("The AI returned an empty response. Try again.");
  return content;
}

export function parseJsonLoose(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Could not read the AI analysis. Try again.");
  }
}

import Anthropic from "@anthropic-ai/sdk";

export type Role = "orchestrator" | "worker" | "validator";

const DEFAULT_MODELS: Record<Role, string> = {
  orchestrator: process.env.MODEL_ORCHESTRATOR || "claude-opus-4-7",
  worker: process.env.MODEL_WORKER || "claude-sonnet-4-6",
  validator: process.env.MODEL_VALIDATOR || "claude-opus-4-7",
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not set");
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function isMockMode(): boolean {
  return process.env.SKILLPROOF_MOCK_LLM === "1" || !process.env.ANTHROPIC_API_KEY;
}

export type LLMCallOptions = {
  role: Role;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
};

export type LLMResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export async function llmCall(opts: LLMCallOptions): Promise<LLMResult> {
  const model = DEFAULT_MODELS[opts.role];
  const c = getClient();
  const resp = await c.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.2,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const text = resp.content
    .filter((b) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return {
    text,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    model,
  };
}

// Extract first JSON object/array from a model response. Tolerant of fences.
export function extractJson<T = any>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[\[{]/);
  if (start < 0) return null;
  // try expanding until parse succeeds
  for (let end = body.length; end > start; end--) {
    const slice = body.slice(start, end).trim();
    if (!/[\]}]$/.test(slice)) continue;
    try {
      return JSON.parse(slice) as T;
    } catch {
      // keep shrinking
    }
  }
  return null;
}

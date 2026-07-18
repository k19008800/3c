// ============================================================
//  3cloud (3C) — 供应商同步 定价映射
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema/index.js";
import { DEFAULT_PRICING_MULTIPLIER } from "../price-service.js";

export { DEFAULT_PRICING_MULTIPLIER };

// ── Known pricing (CNY per 1K tokens) ──

const KNOWN_PRICES: Record<string, { input: number; output: number }> = {
  // Claude
  'claude-opus-4-8':    { input: 0.1045, output: 0.5223 },
  'claude-opus-4.7':    { input: 0.1045, output: 0.5223 },
  'claude-sonnet-5':    { input: 0.0209, output: 0.1045 },
  'claude-sonnet-4.6':  { input: 0.0209, output: 0.1045 },
  'claude-sonnet-4.5':  { input: 0.0209, output: 0.1045 },
  'claude-haiku-4-5':   { input: 0.0052, output: 0.0261 },
  'claude-fable-5':     { input: 0.0209, output: 0.1045 },
  // GPT
  'gpt-5.4':            { input: 0.0365, output: 0.1460 },
  'gpt-5.5':            { input: 0.0522, output: 0.2088 },
  'gpt-4o':             { input: 0.0157, output: 0.0626 },
  'gpt-4o-mini':        { input: 0.0010, output: 0.0042 },
  // DeepSeek
  'deepseek-chat':      { input: 0.0027, output: 0.0110 },
  'deepseek-v4-pro':    { input: 0.0055, output: 0.0219 },
  'deepseek-v4-flash':  { input: 0.0027, output: 0.0110 },
  'deepseek-reasoner':  { input: 0.0038, output: 0.0152 },
  // Gemini
  'gemini-2.5-pro':     { input: 0.0083, output: 0.0333 },
  'gemini-2.5-flash':   { input: 0.0015, output: 0.0060 },
  // Qwen
  'qwen-3.6':           { input: 0.0020, output: 0.0080 },
  'qwen-3.6-plus':      { input: 0.0035, output: 0.0140 },
  // Kimi
  'kimi-k2.6':          { input: 0.0050, output: 0.0200 },
  // Minimax
  'minimax-m2.7':       { input: 0.0040, output: 0.0160 },
  // GLM
  'glm-5.1':            { input: 0.0030, output: 0.0120 },
};

export const DEFAULT_PRICE = { input: 0.0030, output: 0.0150 };

export function getModelPrices(modelId: string): { input: number; output: number } {
  const direct = KNOWN_PRICES[modelId];
  if (direct) return direct;
  for (const [k, v] of Object.entries(KNOWN_PRICES)) {
    if (k.toLowerCase() === modelId.toLowerCase()) return v;
  }
  return DEFAULT_PRICE;
}

// ── Type inference ──

const typeHints: Record<string, string> = {
  embedding: "embedding", embed: "embedding", bge: "embedding",
  rerank: "rerank", reranker: "rerank",
  image: "image", dalle: "image",
  video: "video", happyhorse: "video", seedance: "video",
  audio: "audio", tts: "audio", whisper: "audio", speech: "audio",
  moderation: "moderation",
  realtime: "realtime",
};

export function guessModelType(id: string): string {
  const lower = id.toLowerCase();
  for (const [kw, t] of Object.entries(typeHints)) {
    if (lower.includes(kw)) return t;
  }
  return "chat";
}

// ── Get pricing multiplier from system configs ──

export async function getPricingMultiplier(): Promise<number> {
  try {
    const db = getDb();
    const [cfg] = await db
      .select({ value: systemConfigs.value })
      .from(systemConfigs)
      .where(eq(systemConfigs.key, "pricing_multiplier"))
      .limit(1);
    return cfg ? parseFloat(cfg.value) : DEFAULT_PRICING_MULTIPLIER;
  } catch { return DEFAULT_PRICING_MULTIPLIER; }
}

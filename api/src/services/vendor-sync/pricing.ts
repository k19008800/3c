// ============================================================
//  3cloud (3C) — 供应商同步 定价映射
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema/index.js";
import { DEFAULT_PRICING_MULTIPLIER } from "../price-service.js";

export { DEFAULT_PRICING_MULTIPLIER };

// ── Known pricing (CNY per 1M tokens) ──
// 元/百万tokens，计费时系统自动 ÷1,000,000 得到元/token

const KNOWN_PRICES: Record<string, { input: number; output: number }> = {
  // Claude (official prices 2026-07, USD→CNY @7.2)
  // Opus 4.8: $5/$25 → ¥36/¥180
  // Sonnet 5: $2/$10 → ¥14/¥72 (intro pricing)
  // Sonnet 4.6: $3/$15 → ¥22/¥108
  // Haiku 4.5: $1/$5 → ¥7/¥36
  // Fable 5: $10/$50 → ¥72/¥360
  'claude-opus-4-8':    { input: 36, output: 180 },
  'claude-opus-4.7':    { input: 36, output: 180 },
  'claude-opus-4.6':    { input: 36, output: 180 },
  'claude-sonnet-5':    { input: 14, output: 72 },
  'claude-sonnet-4.6':  { input: 22, output: 108 },
  'claude-sonnet-4.5':  { input: 22, output: 108 },
  'claude-haiku-4-5':   { input: 7, output: 36 },
  'claude-fable-5':     { input: 72, output: 360 },
  // GPT (official prices 2026-07, USD→CNY @7.2)
  // GPT-4o: $2.5/$10 → ¥18/¥72
  // GPT-4o mini: $0.15/$0.6 → ¥1/¥4
  // GPT-5.5: $5/$30 → ¥36/¥216
  // GPT-5.4: $2.5/$15 → ¥18/¥108
  'gpt-5.5':            { input: 36, output: 216 },
  'gpt-5.4':            { input: 18, output: 108 },
  'gpt-4o':             { input: 18, output: 72 },
  'gpt-4o-mini':        { input: 1, output: 4 },
  // DeepSeek (official prices as of 2026-07, USD→CNY @7.2)
  // V4 Pro: $0.44/$0.87 → ¥3.17/¥6.26
  // V4 Flash: $0.09/$0.19 → ¥0.65/¥1.37
  // V3.2: $0.27/$0.40 → ¥1.94/¥2.88
  'deepseek-chat':      { input: 194, output: 288 },  // V3.2
  'deepseek-v4-pro':    { input: 317, output: 626 },
  'deepseek-v4-flash':  { input: 65, output: 137 },
  'deepseek-reasoner':  { input: 360, output: 1584 },  // R1: $0.50/$2.20
  // Gemini
  'gemini-2.5-pro':     { input: 8300, output: 33300 },
  'gemini-2.5-flash':   { input: 1500, output: 6000 },
  // Qwen
  'qwen-3.6':           { input: 2000, output: 8000 },
  'qwen-3.6-plus':      { input: 3500, output: 14000 },
  // Kimi
  'kimi-k2.6':          { input: 5000, output: 20000 },
  // Minimax
  'minimax-m2.7':       { input: 4000, output: 16000 },
  // GLM
  'glm-5.1':            { input: 3000, output: 12000 },
};

export const DEFAULT_PRICE = { input: 3000, output: 15000 };

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

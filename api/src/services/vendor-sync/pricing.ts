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
  // Claude
  'claude-opus-4-8':    { input: 104500, output: 522300 },
  'claude-opus-4.7':    { input: 104500, output: 522300 },
  'claude-sonnet-5':    { input: 20900, output: 104500 },
  'claude-sonnet-4.6':  { input: 20900, output: 104500 },
  'claude-sonnet-4.5':  { input: 20900, output: 104500 },
  'claude-haiku-4-5':   { input: 5200, output: 26100 },
  'claude-fable-5':     { input: 20900, output: 104500 },
  // GPT
  'gpt-5.4':            { input: 36500, output: 146000 },
  'gpt-5.5':            { input: 52200, output: 208800 },
  'gpt-4o':             { input: 15700, output: 62600 },
  'gpt-4o-mini':        { input: 1000, output: 4200 },
  // DeepSeek (official prices as of 2026-07)
  // V4 Flash: 入¥1/百万  出¥2/百万
  // V4 Pro:   入¥3/百万  出¥6/百万
  'deepseek-chat':      { input: 1000, output: 2000 },
  'deepseek-v4-pro':    { input: 3000, output: 6000 },
  'deepseek-v4-flash':  { input: 1000, output: 2000 },
  'deepseek-reasoner':  { input: 1000, output: 2000 },
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

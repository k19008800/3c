// ============================================================
//  3cloud (3C) — 供应商模型/价格自动同步服务
//
//  功能：调用上游供应商 /v1/models API，自动同步模型列表和定价。
//  目前支持 OspreyAI (open.ospreyai.cn) 等 OpenAI 兼容接口。
//
//  ── 同步策略 ──
//  1. 从 vendor_models 表获取该 vendor 的 API Key（解密 api_key_encrypted）
//  2. 调用 baseUrl/v1/models 获取上游模型列表
//  3. 新增模型 → 自动创建 models 记录
//  4. 新增 vendor_model 映射 → 自动创建并填入定价
//  5. 已有映射价格为零 → 自动修复定价
//  6. 上游不存在的老映射 → 标记 isDown=true
//
//  ── 调用方式 ──
//  - Cron: syncAllVendors() — app.ts 每 6h 调用
//  - 手动: syncVendorModels(vendorId) — 管理后台同步按钮
//  - API:  POST  /api/v1/admin/vendors/:id/sync-models (vendors.ts)
//  - API:  GET   /api/v1/admin/vendors/:id/sync-status
// ============================================================

import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { models, vendors, vendorModels, vendorApiKeys } from "../db/schema/index.js";
import { decryptApiKey } from "./encryption.js";

// ── Types ──

export interface SyncReport {
  vendorId: number;
  vendorName: string;
  startedAt: string;
  finishedAt: string;
  upstreamModelCount: number;
  existingModelCount: number;
  newModels: string[];
  newMappings: string[];
  updatedPrices: string[];
  removedModels: string[];
  errors: string[];
  pricingSource: 'known_price_map' | 'default_price' | 'none';
}

interface UpstreamModel { id: string; object?: string; owned_by?: string }

// ── In-memory sync status ──

const syncStates = new Map<number, { running: boolean; lastReport?: SyncReport; lastError?: string }>();

// ── Known pricing (CNY per 1K tokens) — mirrors the map in vendors.ts route ──

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

const DEFAULT_PRICE = { input: 0.0030, output: 0.0150 };

function getModelPrices(modelId: string): { input: number; output: number } {
  const direct = KNOWN_PRICES[modelId];
  if (direct) return direct;
  for (const [k, v] of Object.entries(KNOWN_PRICES)) {
    if (k.toLowerCase() === modelId.toLowerCase()) return v;
  }
  return DEFAULT_PRICE;
}

// ── Get API key for a vendor (decrypt from vendor_models) ──

async function getVendorApiKey(vendorId: number): Promise<string | null> {
  const db = getDb();
  try {
    const [mapping] = await db
      .select({ encrypted: vendorModels.apiKeyEncrypted })
      .from(vendorModels)
      .where(and(eq(vendorModels.vendorId, vendorId), sql`length(${vendorModels.apiKeyEncrypted}) > 10`))
      .limit(1);
    if (!mapping) return null;
    return decryptApiKey(mapping.encrypted);
  } catch { return null; }
}

// ── Fetch upstream model list ──

async function fetchUpstreamModels(baseUrl: string, apiKey: string | null): Promise<UpstreamModel[]> {
  const url = baseUrl.replace(/\/+$/, '') + '/v1/models';
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    console.log(`[VendorSync] → GET ${url}`);
    const resp = await fetch(url, { headers, signal: controller.signal });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '').then(t => t.slice(0, 300));
      throw new Error(`HTTP ${resp.status}: ${errText}`);
    }
    const data = await resp.json() as { data?: UpstreamModel[]; object?: string };
    const models = data?.data || [];
    console.log(`[VendorSync] ← ${models.length} models from ${url}`);
    return models;
  } finally { clearTimeout(timeout); }
}

// ── Get pricing multiplier from system configs ──
async function getPricingMultiplier(): Promise<number> {
  try {
    const db = getDb();
    const { systemConfigs } = await import("../db/schema/index.js");
    const [cfg] = await db
      .select({ value: systemConfigs.value })
      .from(systemConfigs)
      .where(eq(systemConfigs.key, "pricing_multiplier"))
      .limit(1);
    return cfg ? parseFloat(cfg.value) : 1.01;
  } catch { return 1.01; }
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

function guessModelType(id: string): string {
  const lower = id.toLowerCase();
  for (const [kw, t] of Object.entries(typeHints)) {
    if (lower.includes(kw)) return t;
  }
  return "chat";
}

// ════════════════════════════════════════
//  主同步函数
// ════════════════════════════════════════

export async function syncVendorModels(
  vendorId: number,
  options?: { dryRun?: boolean; autoCreate?: boolean; autoPrice?: boolean; apiKeyOverride?: string },
): Promise<SyncReport> {
  const db = getDb();
  const startedAt = new Date().toISOString();
  const report: SyncReport = {
    vendorId, vendorName: '', startedAt, finishedAt: '',
    upstreamModelCount: 0, existingModelCount: 0,
    newModels: [], newMappings: [], updatedPrices: [], removedModels: [],
    errors: [], pricingSource: 'default_price',
  };

  const state = syncStates.get(vendorId) || { running: false };
  state.running = true;
  syncStates.set(vendorId, state);

  try {
    // 1. Get vendor
    const [vendor] = await db
      .select({ id: vendors.id, name: vendors.name, baseUrl: vendors.baseUrl })
      .from(vendors).where(eq(vendors.id, vendorId)).limit(1);

    if (!vendor) { report.errors.push('供应商不存在'); return report; }
    report.vendorName = vendor.name;

    // 2. Get API key (from override or DB)
    const apiKey = options?.apiKeyOverride || await getVendorApiKey(vendorId);
    if (!apiKey && !options?.dryRun) {
      report.errors.push('无法获取该供应商的 API Key，请先在 vendor_models 中配置至少一个映射的 API Key，或通过管理后台手动同步');
      return report;
    }

    // 3. Fetch upstream models
    const upstreamModels = await fetchUpstreamModels(vendor.baseUrl, apiKey);
    report.upstreamModelCount = upstreamModels.length;
    if (!upstreamModels.length) {
      report.errors.push('上游未返回有效模型列表');
      return report;
    }

    const upstreamIds = upstreamModels.map(m => m.id);
    report.pricingSource = 'known_price_map';

    // 5. Get pricing multiplier from system_configs (default 1.00)
    const pricingMult = options?.apiKeyOverride ? 1.01 : await getPricingMultiplier();

    // 5. Upsert models + vendor_model mappings in a transaction
    if (!options?.dryRun) {
      for (const um of upstreamModels) {
        const modelName = um.id?.trim();
        if (!modelName) continue;

        const prices = getModelPrices(modelName);
        if (prices === DEFAULT_PRICE) report.pricingSource = 'default_price';

        const sellInput = String((prices.input * pricingMult).toFixed(6));
        const sellOutput = String((prices.output * pricingMult).toFixed(6));
        const modelType = guessModelType(modelName);

        try {
          // Upsert model
          let modelId: number;
          const [existingModel] = await db
            .select({ id: models.id }).from(models).where(eq(models.name, modelName)).limit(1);

          if (existingModel) {
            modelId = existingModel.id;
          } else {
            const [created] = await db.insert(models).values({
              name: modelName, displayName: modelName, type: modelType as any, status: true,
            }).returning({ id: models.id });
            modelId = created.id;
            report.newModels.push(modelName);
          }

          // Check existing vendor_model mapping
          const [existingMapping] = await db
            .select({
              id: vendorModels.id,
              sellPriceInput: vendorModels.sellPriceInput,
              sellPriceOutput: vendorModels.sellPriceOutput,
            })
            .from(vendorModels)
            .where(and(eq(vendorModels.vendorId, vendorId), eq(vendorModels.modelId, modelId)))
            .limit(1);

          if (existingMapping) {
            // Update zero prices
            const hasNoPrice = Number(existingMapping.sellPriceInput) === 0 && Number(existingMapping.sellPriceOutput) === 0;
            if (hasNoPrice) {
              await db.update(vendorModels).set({
                costPriceInput: String(prices.input),
                costPriceOutput: String(prices.output),
                sellPriceInput: sellInput,
                sellPriceOutput: sellOutput,
              }).where(eq(vendorModels.id, existingMapping.id));
              report.updatedPrices.push(modelName);
            }
          } else {
            // Create new mapping (without API key — admin sets it later)
            await db.insert(vendorModels).values({
              vendorId, modelId, upstreamModelName: modelName,
              apiEndpoint: vendor.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions',
              apiKeyEncrypted: '', // Must be set by admin separately
              costPriceInput: String(prices.input), costPriceOutput: String(prices.output),
              sellPriceInput: sellInput, sellPriceOutput: sellOutput,
              weight: 100, status: true,
            });
            report.newMappings.push(modelName);
          }
        } catch (e: any) {
          report.errors.push(`${modelName}: ${e.message}`);
        }
      }

      // 6. Mark removed models as down
      const existingMappings = await db
        .select({ modelName: vendorModels.upstreamModelName, status: vendorModels.status })
        .from(vendorModels)
        .where(eq(vendorModels.vendorId, vendorId));

      for (const mm of existingMappings) {
        if (!upstreamIds.includes(mm.modelName) && mm.status) {
          await db.update(vendorModels)
            .set({ status: false, isDown: true })
            .where(and(eq(vendorModels.vendorId, vendorId), eq(vendorModels.upstreamModelName, mm.modelName)));
          report.removedModels.push(mm.modelName);
        }
      }
    }
  } catch (e: any) {
    report.errors.push(`同步异常: ${e.message}`);
  } finally {
    report.finishedAt = new Date().toISOString();
    const st = syncStates.get(vendorId) || { running: false };
    st.running = false; st.lastReport = report;
    syncStates.set(vendorId, st);
  }

  return report;
}

// ── Status ──

export function getSyncStatus(vendorId: number) {
  return syncStates.get(vendorId) || { running: false };
}

// ── Batch sync all active vendors ──

export async function syncAllVendors(): Promise<SyncReport[]> {
  const db = getDb();
  const allActive = await db
    .select({ id: vendors.id, name: vendors.name, status: vendors.status })
    .from(vendors)
    .where(eq(vendors.status, 'active'));

  const results: SyncReport[] = [];
  for (const v of allActive) {
    try {
      const report = await syncVendorModels(v.id, { autoCreate: true, autoPrice: true });
      results.push(report);
    } catch (e: any) {
      console.error(`[VendorSync] Failed for vendor ${v.name}: ${e.message}`);
    }
  }
  return results;
}

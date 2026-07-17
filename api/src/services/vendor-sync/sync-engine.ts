// ============================================================
//  3cloud (3C) — 供应商同步引擎
// ============================================================

import { eq, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { models, vendors, vendorModels } from "../../db/schema/index.js";
import { getVendorApiKey, fetchUpstreamModels } from "./api-client.js";
import { getModelPrices, guessModelType, getPricingMultiplier, DEFAULT_PRICE } from "./pricing.js";
import type { SyncReport } from "./types.js";

// ── In-memory sync status ──

const syncStates = new Map<number, { running: boolean; lastReport?: SyncReport; lastError?: string }>();

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

    // 5. Get pricing multiplier from system_configs (default 1.01)
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

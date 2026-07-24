// ============================================================
//  3cloud (3C) — 供应商同步引擎
// ============================================================

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { models, vendors, vendorModels } from "../../db/schema/index.js";
import { getVendorApiKey, fetchUpstreamModels } from "./api-client.js";
import { getModelPrices, guessModelType, getPricingMultiplier, DEFAULT_PRICE, DEFAULT_PRICING_MULTIPLIER } from "./pricing.js";
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

    // 5. Get pricing multiplier from system_configs
    const pricingMult = options?.apiKeyOverride ? DEFAULT_PRICING_MULTIPLIER : await getPricingMultiplier();

    // 5. Upsert models + vendor_model mappings in a transaction
    if (!options?.dryRun) {
      // 【优化】批量获取现有模型映射，消除 N+1
      // 获取所有上游模型的名称
      const upstreamModelNames = upstreamModels.map(um => um.id?.trim()).filter(Boolean) as string[];
      
      // 批量查询现有模型
      const existingModelsResult = await db
        .select({ id: models.id, name: models.name })
        .from(models)
        .where(inArray(models.name, upstreamModelNames));
      
      // 构建模型名称到 ID 的映射
      const modelNameToId = new Map<string, number>();
      for (const model of existingModelsResult) {
        modelNameToId.set(model.name, model.id);
      }
      
      // 批量查询现有 vendor_model 映射
      const existingVendorMappings = await db
        .select({
          id: vendorModels.id,
          modelId: vendorModels.modelId,
          modelName: vendorModels.upstreamModelName,
          sellPriceInput: vendorModels.sellPriceInput,
          sellPriceOutput: vendorModels.sellPriceOutput,
        })
        .from(vendorModels)
        .where(and(
          eq(vendorModels.vendorId, vendorId),
          inArray(vendorModels.upstreamModelName, upstreamModelNames)
        ));
      
      // 构建模型 ID 到 vendor_model 映射的映射
      const vendorMappingByModelId = new Map<number, typeof existingVendorMappings[0]>();
      for (const mapping of existingVendorMappings) {
        vendorMappingByModelId.set(mapping.modelId, mapping);
      }
      
      // 批量插入新模型
      const newModelsToInsert = upstreamModels
        .map(um => um.id?.trim())
        .filter((modelName): modelName is string => {
          if (!modelName) return false;
          return !modelNameToId.has(modelName);
        });
      
      if (newModelsToInsert.length > 0) {
        const insertValues = newModelsToInsert.map(modelName => ({
          name: modelName,
          displayName: modelName,
          type: guessModelType(modelName) as any,
          status: true,
        }));
        
        const insertedModels = await db
          .insert(models)
          .values(insertValues)
          .returning({ id: models.id, name: models.name });
        
        for (const model of insertedModels) {
          modelNameToId.set(model.name, model.id);
          report.newModels.push(model.name);
        }
      }
      
      // 批量创建 vendor_model 映射和更新价格
      const vendorModelsToInsert: Array<any> = [];
      const vendorModelsToUpdate: Array<{id: number, values: any}> = [];
      
      for (const um of upstreamModels) {
        const modelName = um.id?.trim();
        if (!modelName) continue;

        const prices = getModelPrices(modelName);
        if (prices === DEFAULT_PRICE) report.pricingSource = 'default_price';

        const sellInput = String((prices.input * pricingMult).toFixed(6));
        const sellOutput = String((prices.output * pricingMult).toFixed(6));
        
        const modelId = modelNameToId.get(modelName);
        if (!modelId) continue; // 理论上不应该发生
        
        const existingMapping = vendorMappingByModelId.get(modelId);
        
        if (existingMapping) {
          // Update zero prices
          const hasNoPrice = Number(existingMapping.sellPriceInput) === 0 && Number(existingMapping.sellPriceOutput) === 0;
          if (hasNoPrice) {
            vendorModelsToUpdate.push({
              id: existingMapping.id,
              values: {
                costPriceInput: String(prices.input),
                costPriceOutput: String(prices.output),
                sellPriceInput: sellInput,
                sellPriceOutput: sellOutput,
              }
            });
            report.updatedPrices.push(modelName);
          }
        } else {
          // Create new mapping
          vendorModelsToInsert.push({
            vendorId,
            modelId,
            upstreamModelName: modelName,
            apiEndpoint: vendor.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions',
            apiKeyEncrypted: '', // Must be set by admin separately
            costPriceInput: String(prices.input),
            costPriceOutput: String(prices.output),
            sellPriceInput: sellInput,
            sellPriceOutput: sellOutput,
            weight: 100,
            status: true,
          });
          report.newMappings.push(modelName);
        }
      }
      
      // 批量执行插入和更新
      if (vendorModelsToInsert.length > 0) {
        await db.insert(vendorModels).values(vendorModelsToInsert);
      }
      
      if (vendorModelsToUpdate.length > 0) {
        for (const update of vendorModelsToUpdate) {
          await db.update(vendorModels)
            .set(update.values)
            .where(eq(vendorModels.id, update.id));
        }
      }

      // 6. Mark removed models as down（已优化为批量）
      const existingMappings = await db
        .select({ modelName: vendorModels.upstreamModelName, status: vendorModels.status })
        .from(vendorModels)
        .where(eq(vendorModels.vendorId, vendorId));
      
      // 【优化】批量更新已下架模型
      const removedModelNames = existingMappings
        .filter(mm => !upstreamIds.includes(mm.modelName) && mm.status)
        .map(mm => mm.modelName);
      
      if (removedModelNames.length > 0) {
        await db.update(vendorModels)
          .set({ status: false, isDown: true })
          .where(and(
            eq(vendorModels.vendorId, vendorId),
            inArray(vendorModels.upstreamModelName, removedModelNames)
          ));
        
        report.removedModels.push(...removedModelNames);
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

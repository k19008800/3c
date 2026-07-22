import { createDb, getDb } from '../src/db/index.js';
import { vendorModels, vendors, models, callLogs, systemConfigs } from '../src/db/schema/index.js';
import { eq, desc } from 'drizzle-orm';

await createDb();
const db = getDb();

// 检查 call_logs 中最近一条有实际 token 的记录
const [call] = await db.select().from(callLogs).where(eq(callLogs.status, 'success')).orderBy(desc(callLogs.id)).limit(1);
console.log('\n=== 最近一条 call_log ===');
console.log('ID:', call.id);
console.log('promptTokens:', call.promptTokens);
console.log('completionTokens:', call.completionTokens);
console.log('cost:', call.cost);
console.log('vendorModelId:', call.vendorModelId);

// 检查对应的 vendor_model 价格
if (call.vendorModelId) {
  const [vm] = await db.select().from(vendorModels).where(eq(vendorModels.id, call.vendorModelId)).limit(1);
  console.log('\n=== 对应 vendor_model ===');
  console.log('sellPriceInput:', vm?.sellPriceInput);
  console.log('sellPriceOutput:', vm?.sellPriceOutput);
  console.log('costPriceInput:', vm?.costPriceInput);
  console.log('costPriceOutput:', vm?.costPriceOutput);
}

// 检查全局倍率
const [cfg] = await db.select().from(systemConfigs).where(eq(systemConfigs.key, 'pricing_multiplier')).limit(1);
console.log('\n=== 全局倍率 ===');
console.log('pricing_multiplier:', cfg?.value);

// 计算预期 cost
if (call.vendorModelId) {
  const [vm] = await db.select().from(vendorModels).where(eq(vendorModels.id, call.vendorModelId)).limit(1);
  if (vm) {
    const expected = (Number(call.promptTokens) * Number(vm.sellPriceInput) + Number(call.completionTokens) * Number(vm.sellPriceOutput)) / 1_000_000;
    console.log('\n=== 预期 cost (修复后公式) ===');
    console.log('预期:', expected.toFixed(6));
    console.log('实际:', call.cost);
    console.log('差异:', ((Number(call.cost) / expected - 1) * 100).toFixed(2) + '%');
  }
}

process.exit(0);

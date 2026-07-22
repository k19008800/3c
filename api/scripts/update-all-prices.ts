import { createDb, getDb } from '../src/db/index.js';
import { vendorModels, vendors, models } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { getModelPrices, getPricingMultiplier } from '../src/services/vendor-sync/pricing.js';

await createDb();
const db = getDb();

console.log('=== 更新所有模型价格为官方定价 ===\n');

const multiplier = await getPricingMultiplier();
console.log('全局倍率:', multiplier);

// 获取所有 vendor_models
const vmList = await db.select({
  id: vendorModels.id,
  vendorId: vendorModels.vendorId,
  modelId: vendorModels.modelId,
  upstreamModelName: vendorModels.upstreamModelName,
  costPriceInput: vendorModels.costPriceInput,
  sellPriceInput: vendorModels.sellPriceInput,
}).from(vendorModels);

console.log('vendor_models 总数:', vmList.length);

const updates: string[] = [];
const skipped: string[] = [];

for (const vm of vmList) {
  const [model] = await db.select().from(models).where(eq(models.id, vm.modelId)).limit(1);
  if (!model) {
    skipped.push(`ID ${vm.id}: model 不存在`);
    continue;
  }

  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vm.vendorId)).limit(1);
  const vendorName = vendor?.name || 'unknown';

  const prices = getModelPrices(model.name);
  const costInput = prices.input;
  const costOutput = prices.output;
  const sellInput = (prices.input * multiplier).toFixed(6);
  const sellOutput = (prices.output * multiplier).toFixed(6);

  // 检查是否需要更新
  const needUpdate = 
    Math.abs(Number(vm.costPriceInput) - costInput) > 0.01 ||
    Math.abs(Number(vm.sellPriceInput) - Number(sellInput)) > 0.01;

  if (needUpdate) {
    await db.update(vendorModels).set({
      costPriceInput: String(costInput),
      costPriceOutput: String(costOutput),
      sellPriceInput: sellInput,
      sellPriceOutput: sellOutput,
    }).where(eq(vendorModels.id, vm.id));

    updates.push(`${vendorName}/${model.name}: ${vm.costPriceInput}/${vm.sellPriceInput} → ${costInput}/${sellInput}`);
  } else {
    skipped.push(`${vendorName}/${model.name}: 已是最新`);
  }
}

console.log('\n已更新 (' + updates.length + ' 个):');
for (const u of updates.slice(0, 20)) {
  console.log('  ', u);
}
if (updates.length > 20) {
  console.log('  ... 还有', updates.length - 20, '个');
}

console.log('\n跳过 (' + skipped.length + ' 个):');
for (const s of skipped.slice(0, 10)) {
  console.log('  ', s);
}

console.log('\n✅ 价格更新完成');

process.exit(0);

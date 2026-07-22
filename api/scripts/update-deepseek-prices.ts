import { createDb, getDb } from '../src/db/index.js';
import { vendorModels, vendors, models } from '../src/db/schema/index.js';
import { eq, and, like } from 'drizzle-orm';
import { getModelPrices, getPricingMultiplier } from '../src/services/vendor-sync/pricing.js';

await createDb();
const db = getDb();

// 获取 DeepSeek vendor
const [vendor] = await db.select().from(vendors).where(eq(vendors.name, 'deepseek')).limit(1);
if (!vendor) {
  console.log('DeepSeek vendor 不存在');
  process.exit(1);
}

console.log('DeepSeek vendor ID:', vendor.id);

// 获取所有 DeepSeek vendor_models
const vmList = await db.select().from(vendorModels).where(eq(vendorModels.vendorId, vendor.id));
console.log('\n当前 DeepSeek vendor_models 数量:', vmList.length);

const multiplier = await getPricingMultiplier();
console.log('全局倍率:', multiplier);

// 更新价格
const updates: string[] = [];
for (const vm of vmList) {
  const [model] = await db.select().from(models).where(eq(models.id, vm.modelId)).limit(1);
  if (!model) continue;

  const prices = getModelPrices(model.name);
  const costInput = prices.input;
  const costOutput = prices.output;
  const sellInput = (prices.input * multiplier).toFixed(6);
  const sellOutput = (prices.output * multiplier).toFixed(6);

  await db.update(vendorModels).set({
    costPriceInput: String(costInput),
    costPriceOutput: String(costOutput),
    sellPriceInput: sellInput,
    sellPriceOutput: sellOutput,
  }).where(eq(vendorModels.id, vm.id));

  updates.push(`${model.name}: cost=${costInput}/${costOutput}, sell=${sellInput}/${sellOutput}`);
}

console.log('\n已更新价格:');
for (const u of updates) {
  console.log('  ', u);
}

console.log('\n✅ DeepSeek 价格已更新为官方定价');

process.exit(0);

import { createDb, getDb } from '../src/db/index.js';
import { vendorModels, vendors, models } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { getModelPrices, getPricingMultiplier } from '../src/services/vendor-sync/pricing.js';

await createDb();
const db = getDb();

// 修复 deepseek-v4-pro 的价格
const [vm] = await db.select().from(vendorModels).where(eq(vendorModels.id, 91)).limit(1);
if (!vm) {
  console.log('vendor_model 91 不存在');
  process.exit(1);
}

// 获取正确的价格
const prices = getModelPrices('deepseek-v4-pro');
const multiplier = await getPricingMultiplier();

console.log('当前价格:');
console.log('  costPriceInput:', vm.costPriceInput);
console.log('  costPriceOutput:', vm.costPriceOutput);
console.log('  sellPriceInput:', vm.sellPriceInput);
console.log('  sellPriceOutput:', vm.sellPriceOutput);

console.log('\n正确价格 (元/百万token):');
console.log('  costPriceInput:', prices.input);
console.log('  costPriceOutput:', prices.output);
console.log('  sellPriceInput:', (prices.input * multiplier).toFixed(6));
console.log('  sellPriceOutput:', (prices.output * multiplier).toFixed(6));

// 更新
await db.update(vendorModels).set({
  costPriceInput: String(prices.input),
  costPriceOutput: String(prices.output),
  sellPriceInput: String((prices.input * multiplier).toFixed(6)),
  sellPriceOutput: String((prices.output * multiplier).toFixed(6)),
}).where(eq(vendorModels.id, 91));

console.log('\n✅ 已修复 vendor_model 91 的价格');

process.exit(0);

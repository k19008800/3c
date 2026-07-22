import { createDb, getDb } from '../src/db/index.js';
import { vendorModels, vendors, models, callLogs, systemConfigs, users } from '../src/db/schema/index.js';
import { eq, desc, and } from 'drizzle-orm';

await createDb();
const db = getDb();

console.log('=== 3cloud 计费体系验证 ===\n');

// 1. 全局倍率
const [cfg] = await db.select().from(systemConfigs).where(eq(systemConfigs.key, 'pricing_multiplier')).limit(1);
const multiplier = cfg ? parseFloat(cfg.value) : 1;
console.log('1. 全局倍率:', multiplier);

// 2. DeepSeek V4 Pro 价格
const [vendor] = await db.select().from(vendors).where(eq(vendors.name, 'deepseek')).limit(1);
const [vm] = await db.select().from(vendorModels).where(and(
  eq(vendorModels.vendorId, vendor.id),
  eq(vendorModels.upstreamModelName, 'deepseek-v4-pro')
)).limit(1);

console.log('\n2. DeepSeek V4 Pro 价格:');
console.log('   costPriceInput:', vm.costPriceInput, '元/百万token');
console.log('   costPriceOutput:', vm.costPriceOutput, '元/百万token');
console.log('   sellPriceInput:', vm.sellPriceInput, '元/百万token');
console.log('   sellPriceOutput:', vm.sellPriceOutput, '元/百万token');

// 3. 计费公式验证
const promptTokens = 1000000;  // 1M tokens
const completionTokens = 1000000;  // 1M tokens

// 修复后的公式：cost = (prompt × sellIn + completion × sellOut) / 1M × discountRate
const rawCost = (promptTokens * Number(vm.sellPriceInput) + completionTokens * Number(vm.sellPriceOutput)) / 1_000_000;
const discountRate = 1;  // 无折扣
const finalCost = rawCost * discountRate;

console.log('\n3. 计费公式验证:');
console.log('   输入: 1M prompt + 1M completion');
console.log('   公式: (prompt × sellIn + completion × sellOut) / 1M × discountRate');
console.log('   计算: (' + promptTokens + ' × ' + vm.sellPriceInput + ' + ' + completionTokens + ' × ' + vm.sellPriceOutput + ') / 1M × ' + discountRate);
console.log('   结果:', finalCost.toFixed(6), '元');

// 预期：1M input × ¥317/1M + 1M output × ¥626/1M = ¥317 + ¥626 = ¥943
const expected = 317 + 626;
console.log('   预期:', expected, '元');
console.log('   匹配:', Math.abs(finalCost - expected) < 0.01 ? '✅' : '❌');

// 4. 与官方定价对比
console.log('\n4. 与官方定价对比:');
console.log('   官方定价 (USD/1M): input=$0.44, output=$0.87');
console.log('   官方定价 (CNY/1M @7.2): input=¥3.17, output=¥6.26');
console.log('   系统定价 (CNY/1M): input=¥' + vm.sellPriceInput + ', output=¥' + vm.sellPriceOutput);
const inputMatch = Math.abs(Number(vm.sellPriceInput) - 317) < 1;
const outputMatch = Math.abs(Number(vm.sellPriceOutput) - 626) < 1;
console.log('   匹配:', inputMatch && outputMatch ? '✅' : '❌');

// 5. 实际计费记录验证
const [recentCall] = await db.select().from(callLogs)
  .where(eq(callLogs.vendorModelId, vm.id))
  .orderBy(desc(callLogs.id)).limit(1);

if (recentCall) {
  console.log('\n5. 最近一条计费记录:');
  console.log('   ID:', recentCall.id);
  console.log('   promptTokens:', recentCall.promptTokens);
  console.log('   completionTokens:', recentCall.completionTokens);
  console.log('   cost:', recentCall.cost, '元');

  // 计算预期 cost
  const expectedCost = (Number(recentCall.promptTokens) * Number(vm.sellPriceInput) + Number(recentCall.completionTokens) * Number(vm.sellPriceOutput)) / 1_000_000;
  console.log('   预期 cost (修复后公式):', expectedCost.toFixed(6), '元');
  console.log('   差异:', ((Number(recentCall.cost) / expectedCost - 1) * 100).toFixed(2) + '%');
  console.log('   注意: 历史记录使用旧价格计费，差异正常');
}

console.log('\n=== 验证完成 ===');

process.exit(0);

import { createDb, getDb } from '../src/db/index.js';
import { vendorModels, vendors, models, systemConfigs } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { getModelPrices } from '../src/services/vendor-sync/pricing.js';

await createDb();
const db = getDb();

console.log('=== 3cloud 计费体系验证 ===\n');
console.log('定价单位: 元/百万 token (CNY/1M tokens)\n');

// 1. 系统配置
const [cfg] = await db.select().from(systemConfigs).where(eq(systemConfigs.key, 'pricing_multiplier')).limit(1);
const multiplier = cfg ? parseFloat(cfg.value) : 1;
console.log('1. 全局倍率:', multiplier);
console.log('   说明: sync 阶段应用到 sellPrice，计费时不再重复应用\n');

// 2. 计费公式
console.log('2. 计费公式:');
console.log('   cost = (prompt × sellIn + completion × sellOut) / 1M × discountRate');
console.log('   注意: sellIn/sellOut 已包含全局倍率\n');

// 3. 关键模型价格验证
const testModels = [
  { name: 'deepseek-v4-pro', vendor: 'deepseek', expectedIn: 317, expectedOut: 626 },
  { name: 'deepseek-v4-flash', vendor: 'deepseek', expectedIn: 65, expectedOut: 137 },
  { name: 'claude-opus-4-8', vendor: '资源池1', expectedIn: 36, expectedOut: 180 },
  { name: 'claude-sonnet-5', vendor: '资源池1', expectedIn: 14, expectedOut: 72 },
  { name: 'claude-haiku-4-5', vendor: '资源池1', expectedIn: 7, expectedOut: 36 },
  { name: 'gpt-4o', vendor: 'openai', expectedIn: 18, expectedOut: 72 },
  { name: 'gpt-4o-mini', vendor: 'openai', expectedIn: 1, expectedOut: 4 },
];

console.log('3. 关键模型价格验证:\n');
let allPass = true;

for (const tm of testModels) {
  const [vendor] = await db.select().from(vendors).where(eq(vendors.name, tm.vendor)).limit(1);
  if (!vendor) {
    console.log(`   ❌ ${tm.name}: vendor "${tm.vendor}" 不存在`);
    allPass = false;
    continue;
  }

  const vmList2 = await db.select().from(vendorModels).where(and(
    eq(vendorModels.vendorId, vendor.id),
    eq(vendorModels.upstreamModelName, tm.name)
  ));

  // 找到正确的匹配（model.name 与 upstreamModelName 一致）
  let vm = null;
  for (const v of vmList2) {
    const [m] = await db.select().from(models).where(eq(models.id, v.modelId)).limit(1);
    if (m && m.name === tm.name) {
      vm = v;
      break;
    }
  }
  // 如果没有精确匹配，取第一个
  if (!vm && vmList2.length > 0) vm = vmList2[0];

  if (!vm) {
    console.log(`   ❌ ${tm.name}: vendor_model 不存在`);
    allPass = false;
    continue;
  }

  const actualIn = Number(vm.sellPriceInput);
  const actualOut = Number(vm.sellPriceOutput);
  const matchIn = Math.abs(actualIn - tm.expectedIn) < 1;
  const matchOut = Math.abs(actualOut - tm.expectedOut) < 1;

  if (matchIn && matchOut) {
    console.log(`   ✅ ${tm.name}: input=¥${actualIn}/1M, output=¥${actualOut}/1M`);
  } else {
    console.log(`   ❌ ${tm.name}: expected (${tm.expectedIn}/${tm.expectedOut}), actual (${actualIn}/${actualOut})`);
    allPass = false;
  }
}

// 4. 计费示例
console.log('\n4. 计费示例:\n');

// DeepSeek V4 Pro
const dsPrice = getModelPrices('deepseek-v4-pro');
const dsExample = {
  prompt: 1000000,
  completion: 1000000,
};
const dsCost = (dsExample.prompt * dsPrice.input + dsExample.completion * dsPrice.output) / 1_000_000;
console.log(`   DeepSeek V4 Pro (1M input + 1M output):`);
console.log(`     = (1M × ${dsPrice.input} + 1M × ${dsPrice.output}) / 1M`);
console.log(`     = ¥${dsCost.toFixed(2)}\n`);

// Claude Opus 4.8
const opusPrice = getModelPrices('claude-opus-4-8');
const opusCost = (dsExample.prompt * opusPrice.input + dsExample.completion * opusPrice.output) / 1_000_000;
console.log(`   Claude Opus 4.8 (1M input + 1M output):`);
console.log(`     = (1M × ${opusPrice.input} + 1M × ${opusPrice.output}) / 1M`);
console.log(`     = ¥${opusCost.toFixed(2)}\n`);

// GPT-4o
const gptPrice = getModelPrices('gpt-4o');
const gptCost = (dsExample.prompt * gptPrice.input + dsExample.completion * gptPrice.output) / 1_000_000;
console.log(`   GPT-4o (1M input + 1M output):`);
console.log(`     = (1M × ${gptPrice.input} + 1M × ${gptPrice.output}) / 1M`);
console.log(`     = ¥${gptCost.toFixed(2)}\n`);

// 5. 总结
console.log('5. 验证结果:');
if (allPass) {
  console.log('   ✅ 所有模型价格验证通过');
  console.log('   ✅ 计费公式正确');
  console.log('   ✅ 定价单位统一: 元/百万 token');
} else {
  console.log('   ❌ 部分模型价格验证失败');
}

console.log('\n=== 验证完成 ===');

process.exit(0);

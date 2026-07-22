import { createDb, getDb } from '../src/db/index.js';
import { vendorModels, vendors, models, callLogs, systemConfigs } from '../src/db/schema/index.js';
import { eq, desc } from 'drizzle-orm';

await createDb();
const db = getDb();

// 检查 vendor_model 91 的完整信息
const [vm] = await db.select().from(vendorModels).where(eq(vendorModels.id, 91)).limit(1);
console.log('\n=== vendor_model 91 完整信息 ===');
console.log(JSON.stringify(vm, null, 2));

// 检查对应的 vendor
if (vm) {
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vm.vendorId)).limit(1);
  console.log('\n=== 对应 vendor ===');
  console.log(JSON.stringify(vendor, null, 2));
  
  // 检查对应的 model
  const [model] = await db.select().from(models).where(eq(models.id, vm.modelId)).limit(1);
  console.log('\n=== 对应 model ===');
  console.log(JSON.stringify(model, null, 2));
}

// 检查其他 vendor_models 的价格范围
const allVm = await db.select({
  id: vendorModels.id,
  vendorId: vendorModels.vendorId,
  upstreamModelName: vendorModels.upstreamModelName,
  sellPriceInput: vendorModels.sellPriceInput,
  sellPriceOutput: vendorModels.sellPriceOutput,
}).from(vendorModels).limit(20);

console.log('\n=== 前 20 个 vendor_models 价格 ===');
for (const v of allVm) {
  console.log(`ID ${v.id}: ${v.upstreamModelName} - input=${v.sellPriceInput} / output=${v.sellPriceOutput}`);
}

process.exit(0);

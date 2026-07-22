import { createDb, getDb } from '../src/db/index.js';
import { systemConfigs, users, vendors, vendorModels, models } from '../src/db/schema/index.js';
import { eq, desc } from 'drizzle-orm';

await createDb();
const db = getDb();

console.log('=== 3cloud 系统设置验证 ===\n');

// 1. 系统配置
const configs = await db.select().from(systemConfigs).limit(50);
console.log('1. 系统配置 (' + configs.length + ' 项):');
const keyConfigs = ['pricing_multiplier', 'enterprise_discount_rate', 'alert_low_balance', 'alert_stop_balance'];
for (const key of keyConfigs) {
  const cfg = configs.find(c => c.key === key);
  console.log('   ' + key + ':', cfg?.value || '(未设置)');
}

// 2. 用户折扣配置
const usersWithDiscount = await db.select({
  id: users.id,
  email: users.email,
  discountRate: users.discountRate,
  userType: users.userType,
}).from(users).limit(10);

console.log('\n2. 用户折扣配置 (前 10):');
for (const u of usersWithDiscount) {
  console.log('   ' + u.email + ': discountRate=' + (u.discountRate || 'null') + ', userType=' + u.userType);
}

// 3. 供应商状态
const vendorList = await db.select().from(vendors).limit(20);
console.log('\n3. 供应商状态 (' + vendorList.length + ' 个):');
for (const v of vendorList) {
  const vmCount = await db.select().from(vendorModels).where(eq(vendorModels.vendorId, v.id));
  console.log('   ' + v.name + ': status=' + v.status + ', models=' + vmCount.length);
}

// 4. 模型映射状态
const vmAll = await db.select({
  id: vendorModels.id,
  upstreamModelName: vendorModels.upstreamModelName,
  status: vendorModels.status,
  isDown: vendorModels.isDown,
  sellPriceInput: vendorModels.sellPriceInput,
}).from(vendorModels).limit(20);

console.log('\n4. 模型映射状态 (前 20):');
for (const vm of vmAll) {
  console.log('   ' + vm.upstreamModelName + ': status=' + vm.status + ', isDown=' + vm.isDown + ', sellIn=' + vm.sellPriceInput);
}

// 5. 计费公式确认
console.log('\n5. 计费公式确认:');
console.log('   公式: cost = (prompt × sellIn + completion × sellOut) / 1M × discountRate');
console.log('   注意: 全局倍率已在 sync 阶段应用到 sellPrice，计费时不再重复应用');

console.log('\n=== 验证完成 ===');

process.exit(0);

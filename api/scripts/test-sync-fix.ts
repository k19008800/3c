import { createDb, getDb } from '../src/db/index.js';
import { vendors } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { syncVendorModels } from '../src/services/vendor-sync/sync-engine.js';

await createDb();
const db = getDb();

// 测试 DeepSeek 同步（dry run）
const [vendor] = await db.select().from(vendors).where(eq(vendors.name, 'deepseek')).limit(1);
if (!vendor) {
  console.log('DeepSeek vendor 不存在');
  process.exit(1);
}

console.log('测试 DeepSeek 同步 (dry run)...');
console.log('vendor ID:', vendor.id);
console.log('baseUrl:', vendor.baseUrl);

const report = await syncVendorModels(vendor.id, { dryRun: true });

console.log('\n同步报告:');
console.log('  upstreamModelCount:', report.upstreamModelCount);
console.log('  errors:', report.errors);

if (report.errors.length === 0) {
  console.log('\n✅ URL 拼接修复验证通过');
} else {
  console.log('\n❌ 同步失败:', report.errors);
}

process.exit(0);

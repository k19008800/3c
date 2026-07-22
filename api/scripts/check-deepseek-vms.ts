import { createDb, getDb } from '../src/db/index.js';
import { vendorModels, vendors, models } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';

await createDb();
const db = getDb();

const [vendor] = await db.select().from(vendors).where(eq(vendors.name, 'deepseek')).limit(1);
const vmList = await db.select().from(vendorModels).where(eq(vendorModels.vendorId, vendor.id));

console.log('DeepSeek vendor_models:');
for (const vm of vmList) {
  const [model] = await db.select().from(models).where(eq(models.id, vm.modelId)).limit(1);
  console.log(`  ${vm.upstreamModelName} (model.name=${model?.name}): cost=${vm.costPriceInput}/${vm.costPriceOutput}, sell=${vm.sellPriceInput}/${vm.sellPriceOutput}`);
}

process.exit(0);

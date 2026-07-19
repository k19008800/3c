import { getDb } from '../src/db/index.js';
import { vendorModels, models, systemConfigs } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';

async function main() {
  const db = getDb();
  
  // 1. Find DeepSeek models
  const dsModels = await db.select().from(models).where(eq(models.name, 'deepseek-v4-flash'));
  console.log('=== deepseek-v4-flash in models ===');
  console.log(JSON.stringify(dsModels, null, 2));
  
  // 2. Find vendor_model mappings with prices
  const vms = await db
    .select()
    .from(vendorModels)
    .where(and(
      eq(vendorModels.upstreamModelName, 'deepseek-v4-flash')
    ));
  console.log('=== vendor_models for deepseek-v4-flash ===');
  for (const vm of vms) {
    console.log(JSON.stringify({
      id: vm.id,
      vendorId: vm.vendorId,
      modelId: vm.modelId,
      costPriceInput: vm.costPriceInput,
      costPriceOutput: vm.costPriceOutput,
      sellPriceInput: vm.sellPriceInput,
      sellPriceOutput: vm.sellPriceOutput,
      status: vm.status,
      isDown: vm.isDown,
    }, null, 2));
  }

  // 3. Check pricing_multiplier
  const cfg = await db.select().from(systemConfigs).where(eq(systemConfigs.key, 'pricing_multiplier'));
  console.log('=== pricing_multiplier ===');
  console.log(JSON.stringify(cfg, null, 2));

  // 4. Also check deepseek-chat mappings
  const chatVms = await db
    .select()
    .from(vendorModels)
    .where(and(
      eq(vendorModels.upstreamModelName, 'deepseek-chat')
    ));
  console.log('=== vendor_models for deepseek-chat ===');
  for (const vm of chatVms) {
    console.log(JSON.stringify({
      id: vm.id,
      vendorId: vm.vendorId,
      costPriceInput: vm.costPriceInput,
      costPriceOutput: vm.costPriceOutput,
      sellPriceInput: vm.sellPriceInput,
      sellPriceOutput: vm.sellPriceOutput,
      status: vm.status,
    }, null, 2));
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

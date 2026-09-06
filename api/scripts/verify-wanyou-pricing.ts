import { eq, and } from 'drizzle-orm';
import { db, schema } from '../src/db/index';

async function main() {
  const [sup] = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).where(eq(schema.suppliers.code, 'wanwu-youdao')).limit(1);
  if (!sup) throw new Error('wanwu-youdao not found');
  const models = await db.select({
    id: schema.supplierModels.id,
    modelName: schema.supplierModels.modelName,
    costIn: schema.supplierModels.inputPrice,
    costOut: schema.supplierModels.outputPrice,
    status: schema.supplierModels.status,
  }).from(schema.supplierModels).where(eq(schema.supplierModels.supplierId, sup.id)).orderBy(schema.supplierModels.id);

  console.log(`万物有道 supplier id=${sup.id}`);
  for (const m of models) {
    const [p] = await db.select({
      id: schema.vendorPricing.id,
      in: schema.vendorPricing.inputPrice,
      out: schema.vendorPricing.outputPrice,
      group: schema.vendorPricing.pricingGroup,
      status: schema.vendorPricing.status,
    }).from(schema.vendorPricing).where(and(
      eq(schema.vendorPricing.supplierModelId, m.id),
      eq(schema.vendorPricing.pricingGroup, 'default'),
    )).limit(1);
    const cost = `成本 ¥${m.costIn}/${m.costOut}`;
    if (p) {
      console.log(`  [${m.status}] ${m.modelName} · ${cost} → 销售 ¥${p.in}/${p.out} (${p.group}, ${p.status}, id=${p.id})`);
    } else {
      console.log(`  [${m.status}] ${m.modelName} · ${cost} → ❌ 无 default 定价`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
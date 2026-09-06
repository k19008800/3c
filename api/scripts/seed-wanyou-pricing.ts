/**
 * 一次性脚本：为万物有道(wanyou)渠道的 7 个模型铺销售价（成本 × 1.5），建 vendor_pricing(active)。
 *
 * 背景：渠道已注册(supplier id=2633) + 7 个模型(supplier_models)。路由 selectChannel 要求
 * vendor_pricing.status='active' 才可路由。高端模型(claude-opus/gpt-5.x)单价 >¥10/1K，
 * 标准定价接口的 PRICE_UNIT_SUSPECT 守卫会拦截 → 本脚本直插 DB（BOSS 2026-08-26 确认）。
 *
 * 销售价 = 成本价 × 1.5，四舍五入到 3 位小数。幂等：某 supplierModelId + default 组已存在则跳过。
 */
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../src/db/index';

const SUPPLIER_CODE = 'wanwu-youdao';

/** cost(¥/1K) × 1.5 → 3 位小数 */
function sale(cost: string | number): string {
  return (Number(cost) * 1.5).toFixed(3);
}

async function main() {
  // 1. 定位供应商
  const [sup] = await db
    .select({ id: schema.suppliers.id })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.code, SUPPLIER_CODE))
    .limit(1);
  if (!sup) throw new Error(`supplier ${SUPPLIER_CODE} not found`);

  // 2. admin 用户 id（createdBy）
  const [admin] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, 'admin@3cloud.dev'))
    .limit(1);
  const createdBy = admin?.id ?? null;

  // 3. 取该供应商全部 active 模型
  const models = await db
    .select({ id: schema.supplierModels.id, modelName: schema.supplierModels.modelName, inputPrice: schema.supplierModels.inputPrice, outputPrice: schema.supplierModels.outputPrice })
    .from(schema.supplierModels)
    .where(and(
      eq(schema.supplierModels.supplierId, sup.id),
      eq(schema.supplierModels.status, 'active'),
    ))
    .orderBy(schema.supplierModels.id);

  console.log(`供应商 ${SUPPLIER_CODE} (id=${sup.id})，模型 ${models.length} 个`);

  let created = 0, skipped = 0;
  for (const m of models) {
    // 幂等：default 组已存在 → 跳过
    const [existing] = await db
      .select({ id: schema.vendorPricing.id })
      .from(schema.vendorPricing)
      .where(and(
        eq(schema.vendorPricing.supplierModelId, m.id),
        eq(schema.vendorPricing.pricingGroup, 'default'),
      ))
      .limit(1);
    if (existing) {
      console.log(`SKIP  ${m.modelName} (supplierModelId=${m.id}) 已有 default 定价 id=${existing.id}`);
      skipped++;
      continue;
    }

    const inp = sale(m.inputPrice ?? '0');
    const outp = sale(m.outputPrice ?? '0');
    const [row] = await db.insert(schema.vendorPricing).values({
      supplierModelId: m.id,
      pricingGroup: 'default',
      inputPrice: inp,
      outputPrice: outp,
      outputMultiplier: '1.0',
      currency: 'CNY',
      status: 'active',
      createdBy,
    }).returning({ id: schema.vendorPricing.id });
    console.log(`CREATE ${m.modelName} (supplierModelId=${m.id}) → ¥${inp}/${outp} per 1K, pricing id=${row?.id} (active)`);
    created++;
  }

  console.log(`\n完成：新建 ${created}，跳过(已存在) ${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('失败:', e);
  process.exit(1);
});
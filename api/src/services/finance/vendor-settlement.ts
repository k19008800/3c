/**
 * 供应商结算服务 — 月度结算单自动计算 / 列表 / 明细 / 下载 / 账单匹配差异（P1-3）
 *
 * 口径：
 * - 平台应付 = consumption_records.cost 按 (supplier, 月) 聚合（元）
 *   supplier 解析：优先 consumption_records.supplier_id，缺失时回退 JOIN supplier_models
 *   得到的 supplier_models.supplier_id（LEFT JOIN supplier_model_id）
 * - 结算单幂等：同 (supplier_id, period) 已存在 → 直接复用既有记录（不重建、不覆盖）
 * - 状态流转：draft → confirmed（confirm 幂等）
 *
 * @module services/finance/vendor-settlement
 * @see docs/iteration-plan-v2.md P1-3
 * @see SPEC-§25-供应商增强.md（结算/对账）
 */

import { db, schema } from '../../db';
import { eq, and, gte, lt, sql, inArray, desc } from 'drizzle-orm';
import type { NewVendorSettlement, NewVendorSettlementItem } from '../../db/schema/vendor-settlements';

/* ───────── types ───────── */

export interface SettlementListItem {
  id: number;
  supplier_id: number;
  supplier_name: string;
  period: string;
  total_amount: number;
  item_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SettlementDetail extends SettlementListItem {
  items: Array<{ id: number; model_name: string; call_count: number; cost: number }>;
}

export interface BillMatchResult {
  platform_amount: number;
  bill_amount: number;
  diff: number;
  diff_percent: number | null;
  status: 'matched' | 'diff' | 'missing';
}

/* ───────── helpers ───────── */

/** 由 "YYYY-MM" 解析出该月的起止时间（本地时区月初） */
function monthRangeOf(period: string): { start: Date; end: Date } {
  const [y = 1970, m = 1] = period.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/** numeric 列（postgres-js 返回 string）→ number */
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 供应商解析表达式：优先 consumption_records.supplier_id，缺失回退 supplier_models.supplier_id */
const supplierExpr = sql<number>`coalesce(${schema.consumptionRecords.supplierId}, ${schema.supplierModels.supplierId})`;

/**
 * 按 (supplier, 月) 聚合消费 → 应付金额（元，4 位小数）+ 调用次数
 *
 * @param period - 结算月份 YYYY-MM
 * @returns 聚合行（无 supplier 归属的记录被排除）
 */
export async function aggregateBySupplier(
  period: string,
): Promise<Array<{ supplierId: number; totalAmount: number; itemCount: number }>> {
  const { start, end } = monthRangeOf(period);
  const rows = await db
    .select({
      supplierId: supplierExpr,
      totalAmount: sql<string>`round(coalesce(sum(${schema.consumptionRecords.cost}), 0)::numeric, 4)`,
      itemCount: sql<number>`count(*)::int`,
    })
    .from(schema.consumptionRecords)
    .leftJoin(schema.supplierModels, eq(schema.consumptionRecords.supplierModelId, schema.supplierModels.id))
    .where(and(
      gte(schema.consumptionRecords.createdAt, start),
      lt(schema.consumptionRecords.createdAt, end),
      sql`${supplierExpr} is not null`,
    ))
    .groupBy(supplierExpr);

  return rows.map((r) => ({ supplierId: r.supplierId, totalAmount: toNum(r.totalAmount), itemCount: r.itemCount }));
}

/**
 * 单供应商期内按模型聚合明细（调用次数 / 成本）
 */
async function aggregateItemsBySupplier(period: string, supplierId: number) {
  const { start, end } = monthRangeOf(period);
  const rows = await db
    .select({
      modelName: schema.consumptionRecords.model,
      callCount: sql<number>`count(*)::int`,
      cost: sql<string>`round(coalesce(sum(${schema.consumptionRecords.cost}), 0)::numeric, 4)`,
    })
    .from(schema.consumptionRecords)
    .leftJoin(schema.supplierModels, eq(schema.consumptionRecords.supplierModelId, schema.supplierModels.id))
    .where(and(
      eq(supplierExpr, supplierId),
      gte(schema.consumptionRecords.createdAt, start),
      lt(schema.consumptionRecords.createdAt, end),
    ))
    .groupBy(schema.consumptionRecords.model);

  return rows.map((r) => ({ modelName: r.modelName, callCount: r.callCount, cost: toNum(r.cost) }));
}

/** 供应商 id → 名称 映射（批量取，减少查询） */
async function supplierNames(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: schema.suppliers.id, name: schema.suppliers.name })
    .from(schema.suppliers)
    .where(inArray(schema.suppliers.id, ids));
  for (const r of rows) map.set(r.id, r.name);
  return map;
}

/** 查既有结算单（幂等命中） */
async function findExisting(supplierId: number, period: string) {
  const rows = await db
    .select()
    .from(schema.vendorSettlements)
    .where(and(
      eq(schema.vendorSettlements.supplierId, supplierId),
      eq(schema.vendorSettlements.period, period),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 生成月度供应商结算单（幂等）
 *
 * 对期内每个有消费的供应商：同 (supplier_id, period) 已生成 → 复用既有结算单
 * （200 返回既有结果，不覆盖、不重建）；否则事务内创建主表 + 明细。
 *
 * @param period - 结算月份 YYYY-MM
 * @param operatorId - 操作管理员 user id（写 created_by）
 * @returns 结算单列表（含既有与新生成）
 */
export async function generateSettlements(
  period: string,
  operatorId: number,
): Promise<Array<{ settlement_id: number; supplier_id: number; supplier_name: string; period: string; total_amount: number; item_count: number; status: string }>> {
  const agg = await aggregateBySupplier(period);

  const results: Array<{
    settlement_id: number;
    supplier_id: number;
    supplier_name: string;
    period: string;
    total_amount: number;
    item_count: number;
    status: string;
  }> = [];

  for (const row of agg) {
    const existing = await findExisting(row.supplierId, period);
    if (existing) {
      results.push({
        settlement_id: existing.id,
        supplier_id: existing.supplierId,
        supplier_name: '',
        period: existing.period,
        total_amount: toNum(existing.totalAmount),
        item_count: existing.itemCount,
        status: existing.status,
      });
      continue;
    }

    const items = await aggregateItemsBySupplier(period, row.supplierId);
    let settlement: typeof schema.vendorSettlements.$inferSelect;
    try {
      settlement = await db.transaction(async (tx) => {
        const [s] = await tx.insert(schema.vendorSettlements).values({
          supplierId: row.supplierId,
          period,
          totalAmount: String(row.totalAmount),
          itemCount: row.itemCount,
          status: 'draft',
          createdBy: operatorId,
        } satisfies NewVendorSettlement).returning();
        if (!s) throw new Error('vendor settlement insert returned no row');
        if (items.length > 0) {
          await tx.insert(schema.vendorSettlementItems).values(
            items.map((it): NewVendorSettlementItem => ({
              settlementId: s.id,
              modelName: it.modelName,
              callCount: it.callCount,
              cost: String(it.cost),
            })),
          );
        }
        return s;
      });
    } catch (e) {
      // 并发生成竞态 → 唯一索引 (supplier_id, period) 兜底：命中即复用
      if ((e as { code?: string })?.code === '23505') {
        const dup = await findExisting(row.supplierId, period);
        if (dup) {
          results.push({
            settlement_id: dup.id,
            supplier_id: dup.supplierId,
            supplier_name: '',
            period: dup.period,
            total_amount: toNum(dup.totalAmount),
            item_count: dup.itemCount,
            status: dup.status,
          });
          continue;
        }
      }
      throw e;
    }

    results.push({
      settlement_id: settlement.id,
      supplier_id: settlement.supplierId,
      supplier_name: '',
      period: settlement.period,
      total_amount: toNum(settlement.totalAmount),
      item_count: settlement.itemCount,
      status: settlement.status,
    });
  }

  // 补充供应商名称（一次批量查询）
  const names = await supplierNames(results.map((r) => r.supplier_id));
  for (const r of results) r.supplier_name = names.get(r.supplier_id) ?? `#${r.supplier_id}`;

  return results;
}

/**
 * 结算单列表（period / supplier_id 过滤 + 分页）
 */
export async function listSettlements(params: {
  period?: string;
  supplierId?: number;
  page: number;
  pageSize: number;
}): Promise<{ items: SettlementListItem[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const conditions: any[] = [];
  if (params.period) conditions.push(eq(schema.vendorSettlements.period, params.period));
  if (params.supplierId) conditions.push(eq(schema.vendorSettlements.supplierId, params.supplierId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: schema.vendorSettlements.id,
        supplierId: schema.vendorSettlements.supplierId,
        period: schema.vendorSettlements.period,
        totalAmount: schema.vendorSettlements.totalAmount,
        itemCount: schema.vendorSettlements.itemCount,
        status: schema.vendorSettlements.status,
        createdAt: schema.vendorSettlements.createdAt,
        updatedAt: schema.vendorSettlements.updatedAt,
      })
      .from(schema.vendorSettlements)
      .where(where)
      .orderBy(desc(schema.vendorSettlements.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.vendorSettlements).where(where),
  ]);

  const names = await supplierNames(rows.map((r) => r.supplierId));
  const items: SettlementListItem[] = rows.map((r) => ({
    id: r.id,
    supplier_id: r.supplierId,
    supplier_name: names.get(r.supplierId) ?? `#${r.supplierId}`,
    period: r.period,
    total_amount: toNum(r.totalAmount),
    item_count: r.itemCount,
    status: r.status,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  }));

  return { items, total: countRows[0]?.count ?? 0, page, pageSize };
}

/**
 * 结算单详情（含明细：模型 / 调用次数 / 成本）
 *
 * @returns null 表示不存在（路由转 404）
 */
export async function getSettlementDetail(id: number): Promise<SettlementDetail | null> {
  const [settlement] = await db
    .select()
    .from(schema.vendorSettlements)
    .where(eq(schema.vendorSettlements.id, id))
    .limit(1);
  if (!settlement) return null;

  const [items, names] = await Promise.all([
    db
      .select({
        id: schema.vendorSettlementItems.id,
        modelName: schema.vendorSettlementItems.modelName,
        callCount: schema.vendorSettlementItems.callCount,
        cost: schema.vendorSettlementItems.cost,
      })
      .from(schema.vendorSettlementItems)
      .where(eq(schema.vendorSettlementItems.settlementId, id))
      .orderBy(desc(schema.vendorSettlementItems.cost)),
    supplierNames([settlement.supplierId]),
  ]);

  return {
    id: settlement.id,
    supplier_id: settlement.supplierId,
    supplier_name: names.get(settlement.supplierId) ?? `#${settlement.supplierId}`,
    period: settlement.period,
    total_amount: toNum(settlement.totalAmount),
    item_count: settlement.itemCount,
    status: settlement.status,
    created_at: settlement.createdAt.toISOString(),
    updated_at: settlement.updatedAt.toISOString(),
    items: items.map((it) => ({
      id: it.id,
      model_name: it.modelName,
      call_count: it.callCount,
      cost: toNum(it.cost),
    })),
  };
}

/** CSV 字段转义（含逗号/引号/换行时加引号） */
function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 结算单下载内容（CSV）
 *
 * @returns null 表示不存在；filename 为 vendor-settlement-{period}-{supplier_id}.csv
 */
export async function getSettlementCsv(id: number): Promise<{ filename: string; csv: string } | null> {
  const detail = await getSettlementDetail(id);
  if (!detail) return null;

  const lines: string[] = ['model_name,call_count,cost'];
  for (const it of detail.items) {
    lines.push(`${csvEscape(it.model_name)},${it.call_count},${it.cost.toFixed(4)}`);
  }
  lines.push(`TOTAL,${detail.item_count},${detail.total_amount.toFixed(4)}`);

  return {
    filename: `vendor-settlement-${detail.period}-${detail.supplier_id}.csv`,
    csv: lines.join('\n'),
  };
}

/**
 * 供应商账单匹配差异（只读计算，不落库）
 *
 * - platform_amount = 平台期内聚合应付（与 generate 同口径，4 位小数）
 * - diff = bill_amount - platform_amount
 * - diff_percent = diff / platform_amount × 100（platform=0 时为 null，避免除零）
 * - status：
 *   - platform=0 且 bill≠0 → missing（供应商有账单但平台无数据）
 *   - |diff| ≤ 0.0001 → matched
 *   - 其余 → diff
 */
export async function matchSupplierBill(params: {
  period: string;
  supplierId: number;
  billAmount: number;
}): Promise<BillMatchResult> {
  const { period, supplierId, billAmount } = params;
  const { start, end } = monthRangeOf(period);
  const [agg] = await db
    .select({
      total: sql<string>`round(coalesce(sum(${schema.consumptionRecords.cost}), 0)::numeric, 4)`,
    })
    .from(schema.consumptionRecords)
    .leftJoin(schema.supplierModels, eq(schema.consumptionRecords.supplierModelId, schema.supplierModels.id))
    .where(and(
      eq(supplierExpr, supplierId),
      gte(schema.consumptionRecords.createdAt, start),
      lt(schema.consumptionRecords.createdAt, end),
    ));

  const platformAmount = toNum(agg?.total);
  const diff = Math.round((billAmount - platformAmount) * 10000) / 10000;
  const diffPercent = platformAmount > 0
    ? Math.round((diff / platformAmount) * 10000) / 100
    : null;

  let status: BillMatchResult['status'];
  if (platformAmount === 0 && billAmount !== 0) {
    status = 'missing';
  } else if (Math.abs(diff) <= 0.0001) {
    status = 'matched';
  } else {
    status = 'diff';
  }

  return { platform_amount: platformAmount, bill_amount: billAmount, diff, diff_percent: diffPercent, status };
}

/**
 * 确认结算单：draft → confirmed（幂等：已 confirmed 直接返回）
 *
 * @returns null 表示不存在；返回确认后的结算单行
 */
export async function confirmSettlement(id: number) {
  const [settlement] = await db
    .select()
    .from(schema.vendorSettlements)
    .where(eq(schema.vendorSettlements.id, id))
    .limit(1);
  if (!settlement) return null;

  if (settlement.status !== 'confirmed') {
    const [updated] = await db
      .update(schema.vendorSettlements)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(schema.vendorSettlements.id, id))
      .returning();
    return updated;
  }
  return settlement;
}

import { eq, and } from "drizzle-orm";
import { db, pool } from "../db/index";
import { platformLedger, type NewPlatformLedger } from "../db/schema/platform-ledger";
import { reconciliationDifferences } from "../db/schema/reconciliation-differences";
import { accountingPeriods } from "../db/schema/accounting-periods";

/**
 * 资金与对账服务
 * 对齐 SPEC-§29：平台资金流水 / 对账差异 / 财务锁账
 */

/** 生成流水号 FL + 日期 + 序号 */
export async function nextSerialNo(date = new Date()): Promise<string> {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `FL${ymd}`;
  const row = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM platform_ledger WHERE serial_no LIKE $1 || '%'`,
    [prefix],
  );
  const seq = (row.rows[0]?.cnt ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

/**
 * 写入平台资金流水（幂等串号 + 实时余额）
 * type: LEDGER 类型，direction 未指定则按默认映射
 * 返回插入记录
 */
export async function writeLedger(
  input: Omit<
    NewPlatformLedger,
    "serialNo" | "balanceAfter"
  > & {
    type: (typeof platformLedger)["$inferInsert"]["type"];
  } & { amount: string | number },
): Promise<any> {
  const direction = (input.direction as "in" | "out") ?? "in";
  const amount = Number(input.amount);
  const serialNo = await nextSerialNo();
  // 实时计算平台总余额 = 所有已完成流水净值
  const bal = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0)::float AS net
     FROM platform_ledger WHERE status='completed'`,
  );
  const balanceAfter = Math.round((Number(bal.rows[0]?.net ?? 0) + (direction === "in" ? amount : -amount)) * 10000) / 10000;
  const row = await db.insert(platformLedger).values({
    ...input,
    serialNo,
    direction,
    amount: String(amount),
    balanceAfter: String(balanceAfter),
    status: (input.status as string) ?? "completed",
  } as any).returning();
  return row[0];
}

/** 内部调账（需 reason + operator） */
export async function internalAdjust(params: {
  amount: number; // 正数=入账，负数=出账
  remark: string;
  operatorId: number;
  targetType?: "user" | "agent" | "vendor";
  targetId?: number;
}): Promise<any> {
  const { amount, remark, operatorId } = params;
  if (!amount || !remark) throw new Error("金额与原因必填");
  const direction = amount >= 0 ? "in" : "out";
  const row = await writeLedger({
    type: "internal_adjust",
    direction,
    amount: String(Math.abs(amount)),
    remark,
    operatorId,
    userId: params.targetType === "user" ? params.targetId : null,
    agentId: params.targetType === "agent" ? params.targetId : null,
    vendorId: params.targetType === "vendor" ? params.targetId : null,
  });
  return row;
}

/** 冲正一笔流水 */
export async function reverseLedger(serialNo: string, operatorId: number, reason: string) {
  const rec = await db.select().from(platformLedger).where(eq(platformLedger.serialNo, serialNo)).limit(1);
  if (!rec[0]) throw new Error("流水不存在");
  if (rec[0].status === "reversed") throw new Error("已冲正");
  const amount = Number(rec[0].amount);
  const dir = rec[0].direction === "in" ? "out" : "in";
  await writeLedger({
    type: rec[0].type,
    direction: dir,
    amount: String(amount),
    remark: `冲正 ${serialNo}: ${reason}`,
    operatorId,
    userId: rec[0].userId,
    agentId: rec[0].agentId,
    vendorId: rec[0].vendorId,
    relatedOrderNo: rec[0].relatedOrderNo,
    reversedBySerial: rec[0].serialNo,
  });
  await db.update(platformLedger).set({ status: "reversed", reversedBySerial: serialNo }).where(eq(platformLedger.id, rec[0].id));
  return { ok: true, original: serialNo };
}

/**
 * 对账引擎：对比某供应商某周期的 平台结算单 vs 平台记账，生成差异记录
 * 简化实现：以 vendor_settlements(结算单) vs platform_ledger(vendor_settlement 类型) 对比
 * 若存在未入账的结算单金额不一致则生成差异
 */
export async function reconcileVendor(period: string) {
  const rows = await pool.query(
    `SELECT vs.id, vs.vendor_id, v.name AS vendor_name, vs.settlement_amount AS platform_amount,
            COALESCE((SELECT SUM(amount) FROM platform_ledger WHERE type='vendor_settlement' AND vendor_id=vs.vendor_id AND status='completed'),0) AS ledger_amount
     FROM vendor_settlements vs JOIN vendors v ON v.id=vs.vendor_id
     WHERE vs.period=$1`,
    [period],
  );
  for (const r of rows.rows) {
    const platform = Number(r.settlement_amount);
    // 平台记账 = ledger 中该供应商该周期的结算支出（同一结算单可能有多次流水，取总额对比）
    const diff = Math.round((platform - Number(r.ledger_amount)) * 10000) / 10000;
    if (Math.abs(diff) > 0.01) {
      const exist = await db.select().from(reconciliationDifferences)
        .where(and(
          eq(reconciliationDifferences.subjectType, "vendor"),
          eq(reconciliationDifferences.subjectId, Number(r.vendor_id)),
          eq(reconciliationDifferences.period, period),
          eq(reconciliationDifferences.checkType, "settlement"),
        ))
        .limit(1);
      if (exist[0]) {
        await db.update(reconciliationDifferences)
          .set({ platformAmount: String(platform), counterpartyAmount: String(platform + diff), diffAmount: String(diff) })
          .where(eq(reconciliationDifferences.id, exist[0].id));
      } else {
        await db.insert(reconciliationDifferences).values({
          subjectType: "vendor", subjectId: Number(r.vendor_id), period, checkType: "settlement",
          platformAmount: String(platform), counterpartyAmount: String(platform + diff), diffAmount: String(diff),
        });
      }
    }
  }
  return { checked: rows.rows.length };
}

/**
 * 财务锁账：计算某月收入/支出/毛利，锁定并生成结转凭证号
 */
export async function closePeriod(period: string, operatorId: number): Promise<{ ok: boolean; message: string }> {
  const ex = await db.select().from(accountingPeriods).where(eq(accountingPeriods.period, period)).limit(1);
  if (ex[0] && ex[0].status === "locked") return { ok: false, message: "该期间已锁账" };
  const [y, m] = period.split("-").map(Number) as [number, number];
  const start = new Date(y, m - 1, 1).toISOString();
  const end = new Date(y, m, 1).toISOString();
  const sum = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE direction='in' AND status='completed' AND created_at>=$1 AND created_at<$2),0)::float AS income,
       COALESCE(SUM(amount) FILTER (WHERE direction='out' AND status='completed' AND created_at>=$1 AND created_at<$2),0)::float AS expense
     FROM platform_ledger`,
    [start, end],
  );
  const income = Number(sum.rows[0]?.income ?? 0);
  const expense = Number(sum.rows[0]?.expense ?? 0);
  const profit = Math.round((income - expense) * 100) / 100;
  const margin = income > 0 ? Math.round((profit / income) * 10000) / 100 : 0;
  const voucherNo = `V${period.replace("-", "")}${String(ex[0]?.id ?? Date.now()).slice(-4)}`;
  if (ex[0]) {
    await db.update(accountingPeriods)
      .set({ status: "locked", incomeTotal: String(income), expenseTotal: String(expense), grossProfit: String(profit), grossMargin: String(margin), lockedBy: operatorId, lockedAt: new Date(), voucherNo, unlockedReason: null })
      .where(eq(accountingPeriods.id, ex[0].id));
  } else {
    await db.insert(accountingPeriods).values({
      period, status: "locked", incomeTotal: String(income), expenseTotal: String(expense), grossProfit: String(profit), grossMargin: String(margin), lockedBy: operatorId, lockedAt: new Date(), voucherNo,
    });
  }
  return { ok: true, message: "结账完成" };
}

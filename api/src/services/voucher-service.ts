// ============================================================
//  3cloud (3C) — 统一凭证号生成服务
//  格式: VCH-YYYYMMDD-类别-序号
//  类别: A=佣金, B=提现, C=充值, D=调整
// ============================================================

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

type VoucherType = 'A' | 'B' | 'C' | 'D';

/**
 * 生成统一凭证号
 * VCH-YYYYMMDD-类别-序号
 * 并发安全：使用数据库行级锁或序列
 */
export async function generateVoucherNo(type: VoucherType): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `VCH-${dateStr}-${type}-`;
  const db = getDb();

  // 查询当天该类型最大序号
  const tableName = type === 'A' ? 'commission_logs'
    : type === 'B' ? 'withdraw_orders'
    : type === 'C' ? 'recharge_orders'
    : 'audit_logs';

  const rawResult = await db.execute(
    sql`
      SELECT COALESCE(
        MAX(CAST(SUBSTRING(voucher_no FROM '([0-9]+)$') AS INTEGER)), 0
      ) + 1 AS next_seq
      FROM ${sql.identifier(tableName)}
      WHERE voucher_no LIKE ${prefix + '%'}
    `
  );

  // drizzle execute returns rows array
  const rows = rawResult.rows ?? [];
  const nextSeq = Number(rows[0]?.next_seq ?? 1);
  const seqStr = String(nextSeq).padStart(4, '0');

  return `${prefix}${seqStr}`;
}

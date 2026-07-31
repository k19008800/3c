// ============================================================
//  3cloud (3C) — 平台资金流水服务（SPEC-§29.1）
//  平台资金流水 = 用户余额变动（balance_logs）+ 提现（withdraw_orders）
//               + 充值（recharge_orders）+ 平台总账（platform_ledger）
//  聚合查询，支持筛选/分页/导出/汇总
// ============================================================

import { eq, and, desc, sql, gt, gte, lt, lte, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  balanceLogs,
  withdrawOrders,
  rechargeOrders,
  platformLedger,
  users,
  agents,
} from "../db/schema.js";
import { AppError } from "./auth-service/index.js";

export type LedgerType =
  | "recharge"        // 充值
  | "consumption"     // 消费
  | "refund"          // 退款
  | "withdraw"        // 提现
  | "commission"      // 佣金
  | "adjust"          // 手工调整
  | "reversal";       // 冲正

export interface LedgerQuery {
  type?: LedgerType;
  direction?: "in" | "out";
  userId?: number;
  agentId?: number;
  startDate?: string;   // YYYY-MM-DD
  endDate?: string;
  keyword?: string;     // 订单号/凭证号模糊搜索
  page?: number;
  pageSize?: number;
}

interface LedgerEntry {
  id: number;
  serialNo: string;
  type: string;
  direction: "in" | "out";
  amount: string;
  balanceAfter: string | null;
  userId: number | null;
  userEmail: string | null;
  userNickname: string | null;
  agentId: number | null;
  relatedOrderNo: string | null;
  paymentChannel: string | null;
  status: string;
  remark: string | null;
  operatorId: number | null;
  createdAt: string;
  source: "balance_logs" | "withdraw_orders" | "recharge_orders" | "platform_ledger";
}

function dateRange(startDate?: string, endDate?: string) {
  const conds: any[] = [];
  if (startDate) conds.push(gte(sql`DATE(${balanceLogs.createdAt})`, startDate));
  if (endDate) conds.push(lte(sql`DATE(${balanceLogs.createdAt})`, endDate));
  return conds;
}

// ── 序列号生成（复用现有模式） ──
export async function generateLedgerSerialNo(): Promise<string> {
  const db = getDb();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const prefix = `PL${y}${m}${d}`;
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(platformLedger)
    .where(sql`${platformLedger.serialNo} LIKE ${prefix + "%"}`);
  const seq = String((row?.cnt ?? 0) + 1).padStart(6, "0");
  return `${prefix}${seq}`;
}

// ── 写入平台总账（供充值/消费/提现等业务调用） ──
export async function writePlatformLedger(input: {
  type: LedgerType;
  direction: "in" | "out";
  amount: string | number;
  balanceAfter?: string | number;
  userId?: number;
  agentId?: number;
  vendorId?: number;
  relatedOrderNo?: string;
  externalRef?: string;
  paymentChannel?: string;
  remark?: string;
  operatorId?: number;
}): Promise<number> {
  const db = getDb();
  const serialNo = await generateLedgerSerialNo();
  const [row] = await db
    .insert(platformLedger)
    .values({
      serialNo,
      type: input.type,
      direction: input.direction,
      amount: String(input.amount),
      balanceAfter: input.balanceAfter != null ? String(input.balanceAfter) : "0.000000",
      userId: input.userId,
      agentId: input.agentId,
      vendorId: input.vendorId,
      relatedOrderNo: input.relatedOrderNo,
      externalRef: input.externalRef,
      paymentChannel: input.paymentChannel,
      status: "completed",
      remark: input.remark,
      operatorId: input.operatorId,
    })
    .returning({ id: platformLedger.id });
  return row.id;
}

// ── 查询平台资金流水（聚合 balance_logs + withdraw_orders + recharge_orders + platform_ledger） ──
export async function queryLedger(q: LedgerQuery) {
  const db = getDb();
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  // 1. balance_logs 部分（用户余额变动：充值/消费/退款/调整）
  const blConds: any[] = [sql`1=1`];
  if (q.userId) blConds.push(eq(balanceLogs.userId, q.userId));
  if (q.startDate) blConds.push(gte(sql`DATE(${balanceLogs.createdAt})`, q.startDate));
  if (q.endDate) blConds.push(lte(sql`DATE(${balanceLogs.createdAt})`, q.endDate));
  if (q.keyword) blConds.push(or(
    sql`${balanceLogs.description} ILIKE ${"%" + q.keyword + "%"}`,
  ));

  // 类型映射：recharge/consumption/refund/adjust → balance_logs.type
  const balTypeMap: Record<string, string> = {
    recharge: "recharge",
    consumption: "consumption",
    refund: "refund",
    adjust: "adjust",
    reversal: "reversal",
  };
  if (q.type && balTypeMap[q.type]) {
    blConds.push(eq(balanceLogs.type, balTypeMap[q.type] as any));
  }

  const blRows = await db
    .select({
      id: balanceLogs.id,
      type: balanceLogs.type,
      amount: balanceLogs.amount,
      balanceAfter: balanceLogs.balanceAfter,
      userId: balanceLogs.userId,
      relatedOrderNo: sql<string | null>`null`,
      paymentChannel: sql<string | null>`null`,
      status: sql<string>`'completed'`,
      remark: balanceLogs.description,
      createdAt: balanceLogs.createdAt,
      userEmail: users.email,
      userNickname: users.nickname,
    })
    .from(balanceLogs)
    .innerJoin(users, eq(balanceLogs.userId, users.id))
    .where(and(...blConds));

  // 2. withdraw_orders 部分（提现，direction=out）
  const wdConds: any[] = [sql`1=1`];
  if (q.startDate) wdConds.push(gte(sql`DATE(${withdrawOrders.createdAt})`, q.startDate));
  if (q.endDate) wdConds.push(lte(sql`DATE(${withdrawOrders.createdAt})`, q.endDate));
  if (q.keyword) wdConds.push(or(
    sql`${withdrawOrders.voucherNo} ILIKE ${"%" + q.keyword + "%"}`,
  ));
  if (q.type === "withdraw" || !q.type) {
    // 仅当筛选类型为 withdraw 或未筛选时包含提现
    if (q.type && q.type !== "withdraw") wdConds.push(sql`1=0`);
  } else {
    wdConds.push(sql`1=0`);
  }

  const wdRows = await db
    .select({
      id: withdrawOrders.id,
      type: sql<string>`'withdraw'`,
      amount: withdrawOrders.amount,
      balanceAfter: sql<string | null>`null`,
      userId: agents.userId,
      relatedOrderNo: withdrawOrders.voucherNo,
      paymentChannel: sql<string | null>`'bank'`,
      status: withdrawOrders.status,
      remark: sql<string | null>`null`,
      createdAt: withdrawOrders.createdAt,
      userEmail: users.email,
      userNickname: users.nickname,
    })
    .from(withdrawOrders)
    .innerJoin(agents, eq(withdrawOrders.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...wdConds));

  // 3. recharge_orders 部分（充值，direction=in）
  const rcConds: any[] = [sql`1=1`];
  if (q.startDate) rcConds.push(gte(sql`DATE(${rechargeOrders.createdAt})`, q.startDate));
  if (q.endDate) rcConds.push(lte(sql`DATE(${rechargeOrders.createdAt})`, q.endDate));
  if (q.keyword) rcConds.push(or(
    sql`${rechargeOrders.orderNo} ILIKE ${"%" + q.keyword + "%"}`,
  ));
  if (q.type === "recharge" || !q.type) {
    if (q.type && q.type !== "recharge") rcConds.push(sql`1=0`);
  } else {
    rcConds.push(sql`1=0`);
  }

  const rcRows = await db
    .select({
      id: rechargeOrders.id,
      type: sql<string>`'recharge'`,
      amount: rechargeOrders.amount,
      balanceAfter: sql<string | null>`null`,
      userId: rechargeOrders.userId,
      relatedOrderNo: rechargeOrders.orderNo,
      paymentChannel: rechargeOrders.channel,
      status: rechargeOrders.status,
      remark: rechargeOrders.remark,
      createdAt: rechargeOrders.createdAt,
      userEmail: users.email,
      userNickname: users.nickname,
    })
    .from(rechargeOrders)
    .innerJoin(users, eq(rechargeOrders.userId, users.id))
    .where(and(...rcConds));

  // 4. platform_ledger 部分（平台总账：佣金/调整/冲正等）
  const plConds: any[] = [sql`1=1`];
  if (q.userId) plConds.push(eq(platformLedger.userId, q.userId));
  if (q.agentId) plConds.push(eq(platformLedger.agentId, q.agentId));
  if (q.type && ["commission", "adjust", "reversal"].includes(q.type)) {
    plConds.push(eq(platformLedger.type, q.type));
  }
  if (q.direction) plConds.push(eq(platformLedger.direction, q.direction));
  if (q.startDate) plConds.push(gte(sql`DATE(${platformLedger.createdAt})`, q.startDate));
  if (q.endDate) plConds.push(lte(sql`DATE(${platformLedger.createdAt})`, q.endDate));
  if (q.keyword) plConds.push(or(
    sql`${platformLedger.serialNo} ILIKE ${"%" + q.keyword + "%"}`,
    sql`${platformLedger.relatedOrderNo} ILIKE ${"%" + q.keyword + "%"}`,
  ));

  const plRows = await db
    .select({
      id: platformLedger.id,
      serialNo: platformLedger.serialNo,
      type: platformLedger.type,
      direction: platformLedger.direction,
      amount: platformLedger.amount,
      balanceAfter: platformLedger.balanceAfter,
      userId: platformLedger.userId,
      agentId: platformLedger.agentId,
      relatedOrderNo: platformLedger.relatedOrderNo,
      paymentChannel: platformLedger.paymentChannel,
      status: platformLedger.status,
      remark: platformLedger.remark,
      createdAt: platformLedger.createdAt,
      userEmail: sql<string | null>`null`,
      userNickname: sql<string | null>`null`,
    })
    .from(platformLedger)
    .where(and(...plConds));

  // ── 合并 & 统一字段 ──
  const merged: LedgerEntry[] = [
    ...blRows.map((r: any) => ({
      id: r.id,
      serialNo: `BL${r.id}`,
      type: r.type,
      direction: (r.type === "recharge" || r.type === "refund") ? "in" as const : "out" as const,
      amount: String(r.amount),
      balanceAfter: r.balanceAfter != null ? String(r.balanceAfter) : null,
      userId: r.userId,
      userEmail: r.userEmail,
      userNickname: r.userNickname,
      agentId: null,
      relatedOrderNo: r.relatedOrderNo,
      paymentChannel: r.paymentChannel,
      status: "completed",
      remark: r.remark,
      operatorId: null,
      createdAt: new Date(r.createdAt).toISOString(),
      source: "balance_logs" as const,
    })),
    ...wdRows.map((r: any) => ({
      id: r.id,
      serialNo: `WD${r.id}`,
      type: "withdraw",
      direction: "out" as const,
      amount: String(r.amount),
      balanceAfter: null,
      userId: r.userId,
      userEmail: r.userEmail,
      userNickname: r.userNickname,
      agentId: null,
      relatedOrderNo: r.relatedOrderNo,
      paymentChannel: r.paymentChannel,
      status: r.status,
      remark: r.remark,
      operatorId: null,
      createdAt: new Date(r.createdAt).toISOString(),
      source: "withdraw_orders" as const,
    })),
    ...rcRows.map((r: any) => ({
      id: r.id,
      serialNo: `RC${r.id}`,
      type: "recharge",
      direction: "in" as const,
      amount: String(r.amount),
      balanceAfter: null,
      userId: r.userId,
      userEmail: r.userEmail,
      userNickname: r.userNickname,
      agentId: null,
      relatedOrderNo: r.relatedOrderNo,
      paymentChannel: r.paymentChannel,
      status: r.status,
      remark: r.remark,
      operatorId: null,
      createdAt: new Date(r.createdAt).toISOString(),
      source: "recharge_orders" as const,
    })),
    ...plRows.map((r: any) => ({
      id: r.id,
      serialNo: r.serialNo,
      type: r.type,
      direction: r.direction,
      amount: String(r.amount),
      balanceAfter: r.balanceAfter != null ? String(r.balanceAfter) : null,
      userId: r.userId,
      userEmail: r.userEmail,
      userNickname: r.userNickname,
      agentId: r.agentId,
      relatedOrderNo: r.relatedOrderNo,
      paymentChannel: r.paymentChannel,
      status: r.status,
      remark: r.remark,
      operatorId: null,
      createdAt: new Date(r.createdAt).toISOString(),
      source: "platform_ledger" as const,
    })),
  ];

  // 排序（时间倒序）
  merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // 分页
  const total = merged.length;
  const list = merged.slice(offset, offset + pageSize);

  // 汇总
  const summary = {
    totalIn: merged.filter((r) => r.direction === "in").reduce((s, r) => s + parseFloat(r.amount), 0),
    totalOut: merged.filter((r) => r.direction === "out").reduce((s, r) => s + parseFloat(r.amount), 0),
    totalCount: total,
    byType: Object.entries(
      merged.reduce((acc: Record<string, number>, r) => {
        acc[r.type] = (acc[r.type] ?? 0) + parseFloat(r.amount);
        return acc;
      }, {})
    ).map(([type, amount]) => ({ type, amount: amount.toFixed(6) })),
  };

  return { list, total, page, pageSize, summary };
}

// ── 查询单笔流水详情 ──
export async function queryLedgerDetail(serialNo: string) {
  const db = getDb();
  // 尝试在 platform_ledger 中查找
  const [pl] = await db
    .select()
    .from(platformLedger)
    .where(eq(platformLedger.serialNo, serialNo))
    .limit(1);
  if (pl) return { ...pl, source: "platform_ledger" };

  // 尝试 balance_logs（BL 前缀）
  if (serialNo.startsWith("BL")) {
    const id = parseInt(serialNo.slice(2), 10);
    const [bl] = await db
      .select()
      .from(balanceLogs)
      .where(eq(balanceLogs.id, id))
      .limit(1);
    if (bl) return { ...bl, source: "balance_logs" };
  }
  // 尝试 withdraw_orders（WD 前缀）
  if (serialNo.startsWith("WD")) {
    const id = parseInt(serialNo.slice(2), 10);
    const [wd] = await db
      .select()
      .from(withdrawOrders)
      .where(eq(withdrawOrders.id, id))
      .limit(1);
    if (wd) return { ...wd, source: "withdraw_orders" };
  }
  // 尝试 recharge_orders（RC 前缀）
  if (serialNo.startsWith("RC")) {
    const id = parseInt(serialNo.slice(2), 10);
    const [rc] = await db
      .select()
      .from(rechargeOrders)
      .where(eq(rechargeOrders.id, id))
      .limit(1);
    if (rc) return { ...rc, source: "recharge_orders" };
  }
  throw new AppError("LEDGER_NOT_FOUND", "流水记录不存在", 404);
}

// ── 手工调整（写 platform_ledger + 可选 balance_logs） ──
export async function adjustLedger(input: {
  type: "adjust" | "reversal";
  direction: "in" | "out";
  amount: string | number;
  userId?: number;
  relatedOrderNo?: string;
  remark: string;
  operatorId: number;
  ip?: string;
}) {
  const db = getDb();
  const amountNum = parseFloat(String(input.amount));
  if (isNaN(amountNum) || amountNum <= 0) {
    throw new AppError("INVALID_AMOUNT", "调整金额必须大于 0", 400);
  }
  if (!input.remark) {
    throw new AppError("REMARK_REQUIRED", "调整原因必填", 400);
  }

  const id = await db.transaction(async (tx) => {
    // 写 platform_ledger
    const serialNo = await generateLedgerSerialNo();
    const [row] = await tx
      .insert(platformLedger)
      .values({
        serialNo,
        type: input.type,
        direction: input.direction,
        amount: String(amountNum),
        balanceAfter: "0.000000",
        userId: input.userId,
        relatedOrderNo: input.relatedOrderNo,
        status: "completed",
        remark: input.remark,
        operatorId: input.operatorId,
      })
      .returning({ id: platformLedger.id });

    // 如果指定 userId，同步写 balance_logs（调整用户余额）
    if (input.userId) {
      const [user] = await tx
        .select({ balance: users.balance })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
      const delta = input.direction === "in" ? amountNum : -amountNum;
      const newBalance = Math.max(0, parseFloat(String(user.balance)) + delta);

      await tx
        .update(users)
        .set({ balance: String(newBalance) })
        .where(eq(users.id, input.userId));

      await tx.insert(balanceLogs).values({
        userId: input.userId,
        amount: String(delta),
        balanceAfter: String(newBalance),
        type: input.type as any,
        refType: "adjust",
        refId: row.id,
        description: input.remark,
      });
    }

    // 审计日志
    await tx.insert(sql`audit_logs` as any).values({
      operatorId: input.operatorId,
      action: "ledger_adjust",
      targetType: "platform_ledger",
      targetId: row.id,
      before: null,
      after: { amount: String(amountNum), direction: input.direction, remark: input.remark },
      ip: input.ip,
      description: `手工调整平台资金流水: ${input.type} ${input.direction} ${amountNum}`,
    });

    return row.id;
  });

  return { id, serialNo: `PL${id}` };
}

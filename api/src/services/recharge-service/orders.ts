// ============================================================
//  充值服务 — 订单创建与管理
// ============================================================

import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  rechargeOrders,
  users,
  systemConfigs,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import crypto from "node:crypto";
import { createPaymentProvider } from "../payment-adapter.js";
import type { CreateOrderInput, CreateOrderResult, BankTransferInput, BankTransferResult, RechargeOrderItem, RechargeOrderListResult } from "./types.js";

// ── 订单号生成 ──

const ORDER_NO_RETRIES = 5;

function generateOrderNo(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase(); // base36 时间戳
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}_${ts}_${rand}`;
}

// ── 获取价格倍率（30 分钟过期的充电订单时限） ──

const ORDER_EXPIRE_MINUTES = 30;

// ──────────────────────────────────────────────
//  创建在线支付充值订单
// ──────────────────────────────────────────────

export async function createRechargeOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const db = getDb();
  const { userId, amount, channel } = input;

  // 通过适配器获取支付通道 Provider
  let provider;
  try {
    provider = createPaymentProvider(channel);
  } catch {
    throw new AppError("INVALID_CHANNEL", `不支持的支付通道: ${channel}`, 400);
  }

  // 验证金额
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    throw new AppError("INVALID_AMOUNT", "充值金额必须大于 0", 400);
  }

  // 获取最小充值金额配置
  const [minCfg] = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, "min_recharge_amount"))
    .limit(1);

  const minAmount = minCfg ? parseFloat(minCfg.value) : 1;
  if (amountNum < minAmount) {
    throw new AppError("AMOUNT_TOO_LOW", `最低充值金额为 ${minAmount} 元`, 400);
  }

  // 生成订单号（重试唯一性）
  let orderNo = "";
  for (let i = 0; i < ORDER_NO_RETRIES; i++) {
    orderNo = generateOrderNo("RECHARGE");
    const [existing] = await db
      .select({ id: rechargeOrders.id })
      .from(rechargeOrders)
      .where(eq(rechargeOrders.orderNo, orderNo))
      .limit(1);
    if (!existing) break;
    if (i === ORDER_NO_RETRIES - 1) {
      throw new AppError("ORDER_NO_FAILED", "生成订单号失败，请重试", 500);
    }
  }

  const expiresAt = new Date(Date.now() + ORDER_EXPIRE_MINUTES * 60 * 1000);

  // 创建订单
  const [order] = await db
    .insert(rechargeOrders)
    .values({
      userId,
      orderNo,
      amount: amountNum.toFixed(6),
      channel,
      status: "pending",
      expiresAt,
    })
    .returning();

  // 通过适配器获取支付参数
  let payResult: { payUrl?: string; payParams?: Record<string, any> } = {};
  try {
    payResult = await provider.createOrder(order.orderNo, order.amount, `充值 ${order.amount} 元`);
  } catch (err) {
    // Provider 抛错不阻断订单创建，仅不返回支付参数
    console.error(`[Payment] Provider.createOrder 失败 (channel=${channel}):`, err);
  }

  const result: CreateOrderResult = {
    orderNo: order.orderNo,
    amount: order.amount,
    channel: order.channel,
    status: order.status,
    payUrl: payResult.payUrl,
    payParams: payResult.payParams as object | undefined,
    expiresAt: order.expiresAt!.toISOString(),
    createdAt: order.createdAt.toISOString(),
  };

  return result;
}

// ──────────────────────────────────────────────
//  提交对公转账
// ──────────────────────────────────────────────

export async function submitBankTransfer(input: BankTransferInput): Promise<BankTransferResult> {
  const db = getDb();
  const { userId, amount, bankName, accountNumber, transferDate, voucherImage, remark } = input;

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    throw new AppError("INVALID_AMOUNT", "充值金额必须大于 0", 400);
  }

  // 生成订单号
  let orderNo = "";
  for (let i = 0; i < ORDER_NO_RETRIES; i++) {
    orderNo = generateOrderNo("BANK");
    const [existing] = await db
      .select({ id: rechargeOrders.id })
      .from(rechargeOrders)
      .where(eq(rechargeOrders.orderNo, orderNo))
      .limit(1);
    if (!existing) break;
    if (i === ORDER_NO_RETRIES - 1) {
      throw new AppError("ORDER_NO_FAILED", "生成订单号失败，请重试", 500);
    }
  }

  // 对公转账不需要过期时间，由后台审核
  const [order] = await db
    .insert(rechargeOrders)
    .values({
      userId,
      orderNo,
      amount: amountNum.toFixed(6),
      channel: "bank_transfer",
      status: "pending",
      voucherImage,
      remark: `银行:${bankName} 账号:${accountNumber} 转账日期:${transferDate}${remark ? ` ${remark}` : ""}`,
      // 独立字段，便于审核展示和对账
      payerAccountName: bankName,
      payerAccountNo: accountNumber,
      transferRemark: remark ?? null,
    })
    .returning();

  return {
    orderNo: order.orderNo,
    amount: order.amount,
    channel: "bank_transfer",
    status: order.status,
    remark: order.remark ?? undefined,
    createdAt: order.createdAt.toISOString(),
  };
}

// ──────────────────────────────────────────────
//  获取上次成功对公转账的付款账户信息（预填用）
// ──────────────────────────────────────────────

export async function getSavedPayerInfo(userId: number): Promise<{ bankName: string | null; accountNumber: string | null } | null> {
  const db = getDb();

  // 先查已确认的，再查已支付的
  const [lastRecord] = await db
    .select({
      payerAccountName: rechargeOrders.payerAccountName,
      payerAccountNo: rechargeOrders.payerAccountNo,
      remark: rechargeOrders.remark,
    })
    .from(rechargeOrders)
    .where(
      and(
        eq(rechargeOrders.userId, userId),
        eq(rechargeOrders.channel, "bank_transfer" as any),
        sql`${rechargeOrders.status} IN ('confirmed', 'paid')`,
      ),
    )
    .orderBy(desc(rechargeOrders.createdAt))
    .limit(1);

  if (!lastRecord) {
    return null;
  }

  // 优先从独立字段读取，兼容旧记录回退解析 remark
  if (lastRecord.payerAccountName && lastRecord.payerAccountNo) {
    return {
      bankName: lastRecord.payerAccountName,
      accountNumber: lastRecord.payerAccountNo,
    };
  }

  if (!lastRecord.remark) return null;

  // 旧格式回退解析
  const bankMatch = lastRecord.remark.match(/^银行:(.+?)\s+账号:/);
  const accountMatch = lastRecord.remark.match(/\s+账号:(.+?)\s+转账日期:/);
  return {
    bankName: bankMatch?.[1] ?? null,
    accountNumber: accountMatch?.[1] ?? null,
  };
}

// ──────────────────────────────────────────────
//  查询用户自己的充值订单
// ──────────────────────────────────────────────

export async function getUserRechargeOrders(
  userId: number,
  page: number = 1,
  pageSize: number = 20,
  status?: string,
): Promise<RechargeOrderListResult> {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions = [eq(rechargeOrders.userId, userId)];
  if (status) {
    conditions.push(eq(rechargeOrders.status, status as any));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(rechargeOrders)
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(rechargeOrders)
    .where(and(...conditions))
    .orderBy(desc(rechargeOrders.createdAt))
    .limit(pageSize)
    .offset(offset);

  const list: RechargeOrderItem[] = rows.map((r) => ({
    id: r.id,
    orderNo: r.orderNo,
    amount: r.amount,
    channel: r.channel,
    status: r.status,
    remark: r.remark,
    paidAt: r.paidAt?.toISOString() ?? null,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return { list, total, page, pageSize };
}

// ──────────────────────────────────────────────
//  取消订单（用户主动取消）
// ──────────────────────────────────────────────

export async function cancelOrder(userId: number, orderId: number): Promise<void> {
  const db = getDb();

  const [order] = await db
    .select()
    .from(rechargeOrders)
    .where(and(
      eq(rechargeOrders.id, orderId),
      eq(rechargeOrders.userId, userId),
    ))
    .limit(1);

  if (!order) {
    throw new AppError("ORDER_NOT_FOUND", "订单不存在", 404);
  }

  if (order.status !== "pending") {
    throw new AppError("ORDER_NOT_CANCELLABLE", `订单状态为 ${order.status}，无法取消`, 400);
  }

  await db
    .update(rechargeOrders)
    .set({ status: "cancelled" })
    .where(eq(rechargeOrders.id, order.id));
}

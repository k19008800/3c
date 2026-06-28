// ============================================================
//  3cloud (3C) — 充值服务
//  功能：在线支付下单、对公转账提交、订单查询、支付回调处理
// ============================================================

import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  rechargeOrders,
  balanceLogs,
  users,
  systemConfigs,
} from "../db/schema.js";
import { AppError } from "./auth-service.js";
import crypto from "node:crypto";

// ── 订单号生成 ──

const ORDER_NO_RETRIES = 5;

function generateOrderNo(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase(); // base36 时间戳
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}_${ts}_${rand}`;
}

// ── 在线支付通道配置 ──

interface PayChannelConfig {
  name: string;
  mockPayUrl: string;        // 扫码支付链接（mock）
  mockJsapiParams: object;   // JSAPI 调起参数（mock）
}

const PAY_CHANNELS: Record<string, PayChannelConfig> = {
  wechat_scan: {
    name: "微信扫码",
    mockPayUrl: "https://pay.weixin.qq.com/qr/3cloud_mock",
    mockJsapiParams: {},
  },
  wechat_jsapi: {
    name: "微信 JSAPI",
    mockPayUrl: "",
    mockJsapiParams: {
      appId: "wx_mock",
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: crypto.randomBytes(8).toString("hex"),
      package: "prepay_id=mock",
      signType: "MD5",
      paySign: "mock_sign",
    },
  },
  alipay_scan: {
    name: "支付宝扫码",
    mockPayUrl: "https://qr.alipay.com/3cloud_mock",
    mockJsapiParams: {},
  },
  alipay_jsapi: {
    name: "支付宝 JSAPI",
    mockPayUrl: "",
    mockJsapiParams: {
      tradeNo: "mock_trade_no",
      qrCode: "https://qr.alipay.com/3cloud_mock",
    },
  },
};

// ── 获取价格倍率（30 分钟过期的充电订单时限） ──

const ORDER_EXPIRE_MINUTES = 30;

// ──────────────────────────────────────────────
//  创建在线支付充值订单
// ──────────────────────────────────────────────

export interface CreateOrderInput {
  userId: number;
  amount: string;   // DECIMAL(18,6) as string
  channel: "wechat_scan" | "wechat_jsapi" | "alipay_scan" | "alipay_jsapi";
}

export interface CreateOrderResult {
  orderNo: string;
  amount: string;
  channel: string;
  status: string;
  payUrl?: string;
  payParams?: object;
  expiresAt: string;
  createdAt: string;
}

export async function createRechargeOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const db = getDb();
  const { userId, amount, channel } = input;
  const channelConfig = PAY_CHANNELS[channel];

  if (!channelConfig) {
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

  const result: CreateOrderResult = {
    orderNo: order.orderNo,
    amount: order.amount,
    channel: order.channel,
    status: order.status,
    expiresAt: order.expiresAt!.toISOString(),
    createdAt: order.createdAt.toISOString(),
  };

  // 扫码支付返回 payUrl
  if (channelConfig.mockPayUrl) {
    result.payUrl = channelConfig.mockPayUrl;
  }

  // JSAPI 支付返回调起参数
  if (Object.keys(channelConfig.mockJsapiParams).length > 0) {
    result.payParams = channelConfig.mockJsapiParams;
  }

  return result;
}

// ──────────────────────────────────────────────
//  提交对公转账
// ──────────────────────────────────────────────

export interface BankTransferInput {
  userId: number;
  amount: string;
  bankName: string;
  accountNumber: string;
  transferDate: string;  // YYYY-MM-DD
  voucherImage?: string; // 凭证图片 URL
  remark?: string;
}

export interface BankTransferResult {
  orderNo: string;
  amount: string;
  channel: "bank_transfer";
  status: string;
  remark?: string;
  createdAt: string;
}

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

  if (!lastRecord || !lastRecord.remark) {
    return null;
  }

  // 从 remark 解析：银行:${bankName} 账号:${accountNumber} 转账日期:${transferDate}
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

export interface RechargeOrderItem {
  id: number;
  orderNo: string;
  amount: string;
  channel: string;
  status: string;
  remark: string | null;
  paidAt: string | null;
  confirmedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface RechargeOrderListResult {
  list: RechargeOrderItem[];
  total: number;
  page: number;
  pageSize: number;
}

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
//  支付回调处理（上游通知）
// ──────────────────────────────────────────────

export async function handlePaymentNotify(
  orderNo: string,
  channelOrderNo: string,
  amount: string,
): Promise<void> {
  const db = getDb();

  const [order] = await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.orderNo, orderNo))
    .limit(1);

  if (!order) {
    throw new AppError("ORDER_NOT_FOUND", `订单 ${orderNo} 不存在`, 404);
  }

  if (order.status !== "pending") {
    // 已处理过的通知直接忽略
    return;
  }

  if (order.amount !== amount) {
    throw new AppError("AMOUNT_MISMATCH", `金额不匹配: 订单 ${order.amount}, 通知 ${amount}`, 400);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // 更新订单状态
    await tx
      .update(rechargeOrders)
      .set({
        status: "paid",
        channelOrderNo,
        paidAt: now,
      })
      .where(eq(rechargeOrders.id, order.id));

    // 增加用户余额
    await tx
      .update(users)
      .set({
        balance: sql`${users.balance} + ${amount}`,
      })
      .where(eq(users.id, order.userId));

    // 记录余额变动
    await tx.insert(balanceLogs).values({
      userId: order.userId,
      amount: amount,
      balanceAfter: sql`(SELECT balance FROM ${users} WHERE id = ${order.userId})`,
      type: "recharge",
      refType: "recharge",
      refId: order.id,
      description: `在线充值 / ${order.channel} / ${orderNo}`,
    });
  });
}

// ──────────────────────────────────────────────
//  后台确认对公转账
// ──────────────────────────────────────────────

export async function confirmBankTransfer(
  orderId: number,
  adminUserId: number,
): Promise<void> {
  const db = getDb();

  const [order] = await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new AppError("ORDER_NOT_FOUND", `订单 (ID ${orderId}) 不存在`, 404);
  }

  if (order.channel !== "bank_transfer") {
    throw new AppError("INVALID_ORDER_TYPE", "仅支持确认对公转账订单", 400);
  }

  if (order.status !== "pending") {
    throw new AppError("ORDER_ALREADY_PROCESSED", `订单状态为 ${order.status}，无法确认`, 400);
  }

  const now = new Date();
  const amount = order.amount;

  await db.transaction(async (tx) => {
    // 更新订单状态
    await tx
      .update(rechargeOrders)
      .set({
        status: "confirmed",
        confirmedBy: adminUserId,
        confirmedAt: now,
      })
      .where(eq(rechargeOrders.id, order.id));

    // 增加用户余额
    await tx
      .update(users)
      .set({
        balance: sql`${users.balance} + ${amount}`,
      })
      .where(eq(users.id, order.userId));

    // 记录余额变动
    await tx.insert(balanceLogs).values({
      userId: order.userId,
      amount: amount,
      balanceAfter: sql`(SELECT balance FROM ${users} WHERE id = ${order.userId})`,
      type: "recharge",
      refType: "recharge",
      refId: order.id,
      description: `对公转账到账 / ${order.remark ?? ""} / ${order.orderNo}`,
    });
  });
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

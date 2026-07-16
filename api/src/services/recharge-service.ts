// ============================================================
//  3cloud (3C) — 充值服务 (Business Logic)
// ============================================================
//
// ── 业务逻辑 ──
//
// 【充值状态机】
//   pending ──用户取消──> cancelled (仅 pending 可取消)
//   pending ──支付回调──> paid (在线支付, 余额入账)
//   pending ──管理员确认──> confirmed (对公转账, 余额入账)
//   paid/confirmed: 终态
//   expired: 超时未支付 (在线支付 30 分钟)
//
// 【在线支付充值 (createRechargeOrder)】
//   - Channel: wechat_scan, wechat_jsapi, alipay_scan, alipay_jsapi
//   - 金额校验: > 0, >= system_configs key=min_recharge_amount (default 1 元)
//   - 订单号: RECHARGE_{base36(timestamp)}_{randomHex8}, 重试 5 次防碰撞
//   - 过期: ORDER_EXPIRE_MINUTES = 30 分钟
//   - 支付参数: createPaymentProvider(channel).createOrder() — adapter 模式
//     - Provider 失败 → 不阻断订单创建 (仅不返回支付参数)
//     - 返回: payUrl / payParams
//
// 【对公转账 (submitBankTransfer)】
//   - 订单号前缀: BANK_ (区别于 RECHARGE_)
//   - remark 格式化: "银行:{bankName} 账号:{accountNumber} 转账日期:{YYYY-MM-DD} [{userRemark}]"
//   - 独立字段: payerAccountName, payerAccountNo, transferRemark (便于审核展示)
//   - 不设过期 (由后台人工审核)
//   - voucherImage: 凭证图片 URL (可选)
//
// 【付款方信息预填 (getSavedPayerInfo)】
//   - 查询上次 confirmed/paid 的对公转账记录
//   - 优先: payerAccountName + payerAccountNo (新字段)
//   - 降级: 从 remark 正则解析 (兼容旧数据)
//
// 【余额入账 (applyRechargeBalance) — 事务内辅助函数】
//   - 逻辑: 先检查当前余额
//     1. currentBalance < 0: 先回补到 0
//        - Math.min(|balance|, rechargeAmount) → negative_repay log
//        - 剩余金额 → recharge log
//        - 刚好抵完 → 余额置 0, 只有 repay 记录
//     2. currentBalance >= 0: 直接增加
//        - UPDATE balance = balance + amount
//        - INSERT balance_logs (type='recharge')
//
// 【支付回调 (handlePaymentNotify) — 事务】
//   1. 订单查找: orderNo
//   2. 状态校验: 非 pending → 拒绝 (cancelled/paid/confirmed/expired 分别报错)
//   3. 金额验证: Math.abs(orderAmount - notifyAmount) > 0.000001 → AMOUNT_MISMATCH
//   4. UPDATE rechargeOrders: status='paid', channelOrderNo, paidAt
//   5. UPDATE users.balance += amount
//   6. applyRechargeBalance: 负余额回补 + 余额日志
//   7. 首充检测: 查询之前是否有 paid/confirmed 订单
//      - 是首充 + 有代理商归属 → processActivityCommission(first_recharge)
//   8. 续费佣金: processRenewalCommission (所有充值)
//
// 【对公转账确认 (confirmBankTransfer) — 事务】
//   - 前置: channel='bank_transfer', status='pending'
//   - UPDATE rechargeOrders: status='confirmed', confirmedBy, confirmedAt
//   - UPDATE users.balance += amount
//   - applyRechargeBalance + processRenewalCommission (同支付回调)
//
// 【取消订单 (cancelOrder)】
//   - 用户+订单双重验证 (userId + orderId)
//   - 仅 pending 可取消 → status='cancelled'
//   - 不操作余额 (未入账)
//
// 【集成点】
//   - payment-adapter.ts: createPaymentProvider 适配器 (多支付通道)
//   - billing.ts: processRenewalCommission, processActivityCommission
//   - balance_logs: type='recharge' / type='negative_repay'
//   - agentClients: 首充活动检测
//   - system_configs: min_recharge_amount

import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  rechargeOrders,
  balanceLogs,
  users,
  systemConfigs,
  agentClients,
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

// ── 支付通道适配器 ──

import { createPaymentProvider, type PaymentProvider } from "./payment-adapter.js";
import { processRenewalCommission, processActivityCommission } from "./billing.js";
// PERF: 静态导入 billing 模块，避免事务内多次动态 import

// ── 获取价格倍率（30 分钟过期的充电订单时限） ──

const ORDER_EXPIRE_MINUTES = 30;

// ── 对公转账 remark 解析（向前兼容旧格式） ──

export function parseBankTransferRemark(remark: string | null): {
  bankName: string | null;
  accountNumber: string | null;
  transferDate: string | null;
  userRemark: string | null;
} {
  if (!remark) return { bankName: null, accountNumber: null, transferDate: null, userRemark: null };

  // 格式: 银行:xxx 账号:xxx 转账日期:YYYY-MM-DD [用户备注]
  const bankMatch = remark.match(/^银行:(.+?)\s+账号:/);
  const accountMatch = remark.match(/\s+账号:(.+?)\s+转账日期:/);
  const dateMatch = remark.match(/\s+转账日期:(\d{4}-\d{2}-\d{2})/);

  let bankName = bankMatch?.[1] ?? null;
  let accountNumber = accountMatch?.[1] ?? null;
  let transferDate = dateMatch?.[1] ?? null;

  // 提取用户备注（去掉前缀后剩余部分）
  let userRemark: string | null = null;
  if (dateMatch) {
    const afterDate = remark.slice(remark.indexOf(dateMatch[0]) + dateMatch[0].length);
    userRemark = afterDate.trim() || null;
  }

  return { bankName, accountNumber, transferDate, userRemark };
}

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

  // 通过适配器获取支付通道 Provider
  let provider: PaymentProvider;
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
//  充值入账辅助函数（含负余额回补逻辑）
//  如果用户存在负余额，先回补到 0，剩余部分记入充值
// ──────────────────────────────────────────────

async function applyRechargeBalance(
  tx: any,
  userId: number,
  amount: string,
  orderId: number,
  channel: string,
  orderNo: string,
): Promise<void> {
  // 读取当前余额
  const [currentUser] = await tx
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const currentBalance = Number(currentUser?.balance ?? 0);
  const rechargeAmount = parseFloat(amount);

  if (currentBalance < 0) {
    // 有负余额 → 先回补到 0，剩余部分计为充值
    const negativeAmount = Math.abs(currentBalance);
    const repayAmount = Math.min(negativeAmount, rechargeAmount);
    const remainingAmount = rechargeAmount - repayAmount;

    // Step 1: 回补负余额到 0
    await tx
      .update(users)
      .set({ balance: "0.000000" })
      .where(eq(users.id, userId));

    await tx.insert(balanceLogs).values({
      userId,
      amount: repayAmount.toFixed(6),
      balanceAfter: "0.000000",
      type: "negative_repay",
      refType: "recharge",
      refId: orderId,
      description: `回补负余额 ${repayAmount.toFixed(6)} 元 / ${channel} / ${orderNo}`,
    });

    // Step 2: 剩余部分进入可用余额
    if (remainingAmount > 0) {
      await tx
        .update(users)
        .set({ balance: remainingAmount.toFixed(6) })
        .where(eq(users.id, userId));

      await tx.insert(balanceLogs).values({
        userId,
        amount: remainingAmount.toFixed(6),
        balanceAfter: remainingAmount.toFixed(6),
        type: "recharge",
        refType: "recharge",
        refId: orderId,
        description: `${channel} / ${orderNo}（扣除回补后剩余）`,
      });
    }
    // 充值金额刚好等于负余额 → 余额置 0，只有 repay 记录
  } else {
    // 余额非负，直接增加
    await tx
      .update(users)
      .set({
        balance: sql`${users.balance} + ${amount}`,
      })
      .where(eq(users.id, userId));

    await tx.insert(balanceLogs).values({
      userId,
      amount,
      balanceAfter: sql`(SELECT balance FROM ${users} WHERE id = ${userId})`,
      type: "recharge",
      refType: "recharge",
      refId: orderId,
      description: `${channel} / ${orderNo}`,
    });
  }
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
    // 非待支付状态的订单不应处理 — 已取消/已完结等状态返回明确错误
    if (order.status === "cancelled") {
      throw new AppError("ORDER_CANCELLED", `订单 ${orderNo} 已取消，无法处理支付通知`, 400);
    }
    if (["paid", "confirmed"].includes(order.status)) {
      // 已成功支付的订单，重复通知视为幂等，不报错但也不返回 SUCCESS
      throw new AppError("ORDER_ALREADY_PAID", `订单 ${orderNo} 已完成，无需重复处理`, 400);
    }
    // 其他状态（expired 等），拒绝处理
    throw new AppError("INVALID_ORDER_STATUS", `订单 ${orderNo} 状态为 ${order.status}，无法处理`, 400);
  }

  const orderAmount = parseFloat(order.amount);
  const notifyAmount = parseFloat(amount);
  if (isNaN(orderAmount) || isNaN(notifyAmount) || Math.abs(orderAmount - notifyAmount) > 0.000001) {
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

    // PERF: 消除直接 UPDATE users.balance，applyRechargeBalance 内部已处理余额变更
    // 记录余额变动（含负余额回补逻辑）
    await applyRechargeBalance(tx, order.userId, amount, order.id, `在线充值 / ${order.channel}`, orderNo);

    // 判断是否首充（用于首充活动奖励）
    const [prevRecharges] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(rechargeOrders)
      .where(and(
        eq(rechargeOrders.userId, order.userId),
        sql`${rechargeOrders.status} IN ('paid', 'confirmed')`,
        sql`${rechargeOrders.id} != ${order.id}`,
      ));
    const isFirstRecharge = Number(prevRecharges?.count ?? 0) === 0;

    // 首充活动奖励
    if (isFirstRecharge) {
      // 查客户是否有代理商归属
      const [firstRechargeClient] = await tx
        .select({ agentId: agentClients.agentId })
        .from(agentClients)
        .where(eq(agentClients.clientUserId, order.userId))
        .limit(1);

      if (firstRechargeClient) {
        // PERF: 使用顶部静态导入，避免事务内动态 import
        await processActivityCommission(
          tx, firstRechargeClient.agentId, order.userId,
          "first_recharge", amount, orderNo,
        );
      }
    }

    // PERF: 使用顶部静态导入，避免事务内动态 import
    await processRenewalCommission(tx, order.userId, order.id, amount, orderNo);
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

    // PERF: 消除直接 UPDATE users.balance，applyRechargeBalance 内部已处理余额变更
    // 记录余额变动（含负余额回补逻辑）
    const bankInfo = order.payerAccountName
      ? `${order.payerAccountName}/${order.payerAccountNo ?? ""}`
      : order.remark ?? "";
    await applyRechargeBalance(tx, order.userId, amount, order.id, `对公转账到账 / ${bankInfo}`, order.orderNo);

    // PERF: 使用顶部静态导入，避免事务内动态 import
    await processRenewalCommission(tx, order.userId, order.id, amount, order.orderNo);
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

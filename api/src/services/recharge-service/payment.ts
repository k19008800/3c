// ============================================================
//  充值服务 — 支付处理
// ============================================================

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  rechargeOrders,
  agentClients,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { processRenewalCommission, processActivityCommission } from "../billing/index.js";
import { applyRechargeBalance } from "./balance.js";

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

  // ⚠️ PERF: 事务一致性 - 此函数被路由层调用，确保路由在事务后才响应
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

// ============================================================
//  充值服务 — 余额操作
// ============================================================

import { eq, sql } from "drizzle-orm";
import { users, balanceLogs } from "../../db/schema.js";

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

// ── 充值入账辅助函数（含负余额回补逻辑） ──
// 如果用户存在负余额，先回补到 0，剩余部分记入充值

export async function applyRechargeBalance(
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

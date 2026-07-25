// ============================================================
//  提现审核服务核心逻辑
// ============================================================

import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { agents, withdrawOrders, auditLogs } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { generateVoucherNo } from "../voucher-service.js";
import { num } from "../agent-helpers.js";
import type {
  FirstReviewParams,
  SecondReviewParams,
  MarkAsPaidParams,
  BatchReviewParams,
  ReviewResult,
  BatchReviewResult,
} from "./review-types.js";
import {
  getWithdrawOrder,
  getBatchWithdrawOrders,
  updateWithdrawOrder,
  updateAgentPendingWithdraw,
  batchUpdateAgentPendingWithdraw,
  insertAuditLog,
  batchInsertAuditLogs,
  batchUpdateWithdrawOrders,
  isOrderReviewable,
  getReviewLevel,
} from "./review-queries.js";
import {
  validateWithdrawStatus,
  buildAuditLog,
  calculateActualAmount,
  prepareBatchProcessing,
  buildAgentAmountUpdates,
  buildBatchDescription,
  buildOrderDescription,
  checkOrderExists,
  getStatusTransition,
} from "./review-utils.js";

/**
 * 初审提现订单
 */
export async function firstReviewWithdraw(params: FirstReviewParams): Promise<ReviewResult> {
  const { operatorId, withdrawId, action, rejectReason } = params;
  const db = getDb();

  const order = await getWithdrawOrder(db, withdrawId);
  checkOrderExists(order, withdrawId);
  
  validateWithdrawStatus(order.status, "pending_first_review", "初审");

  await db.transaction(async (tx) => {
    if (action === "approve") {
      // 初审通过时生成凭证号
      const firstVoucherNo = await generateVoucherNo('B');

      await updateWithdrawOrder(tx, withdrawId, {
        status: "pending_second_review",
        auditLevel: 2,
        firstAuditorId: operatorId,
        firstAuditedAt: new Date(),
        voucherNo: firstVoucherNo,
      });

      await insertAuditLog(tx, buildAuditLog(
        operatorId,
        "withdraw_first_approve",
        withdrawId,
        { status: "pending_first_review" },
        { status: "pending_second_review", voucherNo: firstVoucherNo },
        `初审通过提现 #${withdrawId}，金额 ${order.amount}，凭证号 ${firstVoucherNo}`
      ));
    } else {
      // 拒绝时退还冻结金额
      await updateAgentPendingWithdraw(tx, order.agentId, order.amount);

      await updateWithdrawOrder(tx, withdrawId, {
        status: "rejected",
        auditLevel: 1,
        firstAuditorId: operatorId,
        firstAuditedAt: new Date(),
        rejectReason: rejectReason ?? null,
      });

      await insertAuditLog(tx, buildAuditLog(
        operatorId,
        "withdraw_reject",
        withdrawId,
        { status: "pending_first_review" },
        { status: "rejected", rejectReason },
        `初审拒绝提现 #${withdrawId}: ${rejectReason ?? "无原因"}`
      ));
    }
  });

  return {
    id: withdrawId,
    status: action === "approve" ? "pending_second_review" : "rejected",
  };
}

/**
 * 复审提现订单
 */
export async function secondReviewWithdraw(params: SecondReviewParams): Promise<ReviewResult> {
  const { operatorId, withdrawId, action, rejectReason, bankVoucherUrl } = params;
  const db = getDb();

  const order = await getWithdrawOrder(db, withdrawId);
  checkOrderExists(order, withdrawId);
  
  validateWithdrawStatus(order.status, "pending_second_review", "复审");

  await db.transaction(async (tx) => {
    if (action === "approve") {
      // 复审通过时生成凭证号（若初审未生成则补充）
      const secondVoucherNo = order.voucherNo || await generateVoucherNo('B');

      await updateWithdrawOrder(tx, withdrawId, {
        status: "approved",
        auditLevel: 2,
        secondAuditorId: operatorId,
        secondAuditedAt: new Date(),
        bankVoucherUrl: bankVoucherUrl ?? null,
        voucherNo: secondVoucherNo,
      });

      await insertAuditLog(tx, buildAuditLog(
        operatorId,
        "withdraw_second_approve",
        withdrawId,
        { status: "pending_second_review" },
        { status: "approved", voucherNo: secondVoucherNo },
        `复审通过提现 #${withdrawId}，金额 ${order.amount}，凭证号 ${secondVoucherNo}`
      ));
    } else {
      // 拒绝时退还冻结金额
      await updateAgentPendingWithdraw(tx, order.agentId, order.amount);

      await updateWithdrawOrder(tx, withdrawId, {
        status: "rejected",
        auditLevel: 2,
        secondAuditorId: operatorId,
        secondAuditedAt: new Date(),
        rejectReason: rejectReason ?? null,
      });

      await insertAuditLog(tx, buildAuditLog(
        operatorId,
        "withdraw_reject",
        withdrawId,
        { status: "pending_second_review" },
        { status: "rejected", rejectReason },
        `复审拒绝提现 #${withdrawId}: ${rejectReason ?? "无原因"}`
      ));
    }
  });

  return {
    id: withdrawId,
    status: action === "approve" ? "approved" : "rejected",
  };
}

/**
 * 标记提现订单为已打款
 */
export async function markWithdrawAsPaid(params: MarkAsPaidParams): Promise<ReviewResult> {
  const { operatorId, withdrawId, bankVoucherUrl } = params;
  const db = getDb();

  const order = await getWithdrawOrder(db, withdrawId);
  checkOrderExists(order, withdrawId);
  
  validateWithdrawStatus(order.status, "approved", "标记已打款");

  const now = new Date();

  await db.transaction(async (tx) => {
    await updateWithdrawOrder(tx, withdrawId, {
      status: "paid",
      paidOperatorId: operatorId,
      paidAt: now,
      bankVoucherUrl: bankVoucherUrl ?? order.bankVoucherUrl,
    });

    await insertAuditLog(tx, buildAuditLog(
      operatorId,
      "withdraw_paid",
      withdrawId,
      { status: "approved" },
      { status: "paid" },
      `标记提现 #${withdrawId} 已打款，金额 ${order.amount}`
    ));
  });

  return {
    id: withdrawId,
    status: "paid",
  };
}

/**
 * 旧版提现审核函数（兼容单审流程）
 * @deprecated 请使用 firstReviewWithdraw 或 secondReviewWithdraw
 */
export async function reviewWithdraw(
  operatorId: number,
  withdrawId: number,
  action: "approve" | "reject",
  rejectReason?: string | null,
): Promise<ReviewResult> {
  const db = getDb();

  const order = await getWithdrawOrder(db, withdrawId);
  checkOrderExists(order, withdrawId);
  
  if (!isOrderReviewable(order.status, getReviewLevel(order.status) || 1)) {
    throw new AppError("INVALID_STATUS", `当前状态为 ${order.status}，无法审核`, 400);
  }

  await db.transaction(async (tx) => {
    if (action === "approve") {
      // 审核通过时生成凭证号并计算实际金额
      const voucherNo = await generateVoucherNo('B');
      const actualAmount = calculateActualAmount(order.amount, order.feeAmount);

      await updateWithdrawOrder(tx, withdrawId, {
        status: "approved",
        reviewedBy: operatorId,
        reviewedAt: new Date(),
        voucherNo,
        actualAmount,
      });

      await insertAuditLog(tx, buildAuditLog(
        operatorId,
        "withdraw_approve",
        withdrawId,
        { status: order.status },
        { status: "approved", voucherNo, actualAmount },
        `审核通过提现 #${withdrawId}，金额 ${order.amount}，凭证号 ${voucherNo}`
      ));
    } else {
      await updateAgentPendingWithdraw(tx, order.agentId, order.amount);

      await updateWithdrawOrder(tx, withdrawId, {
        status: "rejected",
        reviewedBy: operatorId,
        reviewedAt: new Date(),
        rejectReason: rejectReason ?? null,
      });

      await insertAuditLog(tx, buildAuditLog(
        operatorId,
        "withdraw_reject",
        withdrawId,
        { status: order.status },
        { status: "rejected", rejectReason },
        `审核拒绝提现 #${withdrawId}: ${rejectReason ?? "无原因"}`
      ));
    }
  });

  return {
    id: withdrawId,
    status: action === "approve" ? "approved" : "rejected",
  };
}

/**
 * 批量审核提现订单
 */
export async function batchReviewWithdraws(params: BatchReviewParams): Promise<BatchReviewResult> {
  const { operatorId, ids, action, rejectReason } = params;
  const db = getDb();
  
  // 批量查询所有提现订单（消除N+1）
  const orders = await getBatchWithdrawOrders(db, ids);
  
  // 准备批量处理数据
  const { validOrders, invalidOrders, agentAmounts } = prepareBatchProcessing(
    orders,
    ids,
    "pending_first_review"
  );
  
  // 批量处理
  let approved = 0;
  let rejected = 0;
  
  if (validOrders.length > 0) {
    await db.transaction(async (tx) => {
      if (action === "approve") {
        // 批量初审通过
        for (const order of validOrders) {
          const firstVoucherNo = await generateVoucherNo('B');
          
          await updateWithdrawOrder(tx, order.id, {
            status: "pending_second_review",
            auditLevel: 2,
            firstAuditorId: operatorId,
            firstAuditedAt: new Date(),
            voucherNo: firstVoucherNo,
          });
            
          await insertAuditLog(tx, buildAuditLog(
            operatorId,
            "withdraw_first_approve",
            order.id,
            { status: "pending_first_review" },
            { status: "pending_second_review", voucherNo: firstVoucherNo },
            `批量初审通过提现 #${order.id}，金额 ${order.amount}`
          ));
        }
        approved = validOrders.length;
      } else {
        // 批量初审拒绝
        // 批量更新代理商冻结金额
        const agentUpdates = Array.from(agentAmounts.entries()).map(([agentId, totalAmount]) => ({
          agentId,
          amount: totalAmount,
        }));
        
        await batchUpdateAgentPendingWithdraw(tx, agentUpdates);
        
        // 批量更新提现订单状态
        const validOrderIds = validOrders.map(o => o.id);
        await batchUpdateWithdrawOrders(tx, validOrderIds, {
          status: "rejected",
          auditLevel: 1,
          firstAuditorId: operatorId,
          firstAuditedAt: new Date(),
          rejectReason: rejectReason ?? null,
        });
          
        // 批量插入审计日志
        const auditLogsData = validOrders.map(order => buildAuditLog(
          operatorId,
          "withdraw_reject",
          order.id,
          { status: "pending_first_review" },
          { status: "rejected", rejectReason },
          `批量初审拒绝提现 #${order.id}: ${rejectReason ?? "无原因"}`
        ));
        
        await batchInsertAuditLogs(tx, auditLogsData);
        
        rejected = validOrders.length;
      }
    });
  }
  
  return { 
    approved, 
    rejected, 
    total: ids.length, 
    errors: invalidOrders 
  };
}
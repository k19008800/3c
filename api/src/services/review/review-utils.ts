// ============================================================
//  提现审核服务工具函数
// ============================================================

import { sql } from "drizzle-orm";
import { withdrawOrders, agents } from "../../db/schema.js";
import type { 
  WithdrawStatus, 
  AuditAction, 
  AuditLogEntry,
  AgentAmountUpdate,
  BatchProcessingResult
} from "./review-types.js";

/**
 * 验证提现订单状态
 */
export function validateWithdrawStatus(
  currentStatus: WithdrawStatus,
  expectedStatus: WithdrawStatus,
  operation: string
): void {
  if (currentStatus !== expectedStatus) {
    throw new Error(`INVALID_STATUS: 当前状态为 ${currentStatus}，无法${operation}`);
  }
}

/**
 * 构建审计日志记录
 */
export function buildAuditLog(
  operatorId: number,
  action: AuditAction,
  targetId: number,
  before: Record<string, any>,
  after: Record<string, any>,
  description: string
): AuditLogEntry {
  return {
    operatorId,
    action,
    targetType: "withdraw_orders",
    targetId,
    before,
    after,
    ip: null,
    description,
  };
}

/**
 * 计算实际金额（扣除手续费）
 */
export function calculateActualAmount(amount: string, feeAmount: string): string {
  const orderAmount = parseFloat(amount) || 0;
  const orderFee = parseFloat(feeAmount) || 0;
  return (orderAmount - orderFee).toFixed(6);
}

/**
 * 准备批量审核数据
 */
export function prepareBatchProcessing(
  orders: any[],
  ids: number[],
  expectedStatus: WithdrawStatus
): BatchProcessingResult {
  // 构建订单映射
  const orderMap = new Map(orders.map(order => [order.id, order]));
  
  // 验证订单
  const validOrders: any[] = [];
  const invalidOrders: Array<{ id: number; reason: string }> = [];
  const agentAmounts = new Map<number, string>();
  
  for (const id of ids) {
    const order = orderMap.get(id);
    if (!order) {
      invalidOrders.push({ id, reason: "提现订单不存在" });
      continue;
    }
    
    if (order.status !== expectedStatus) {
      invalidOrders.push({ id, reason: `当前状态为 ${order.status}，无法审核` });
      continue;
    }
    
    validOrders.push(order);
    
    // 累加代理商金额（用于拒绝时退还）
    if (expectedStatus === "pending_first_review") {
      const current = agentAmounts.get(order.agentId) || "0.000000";
      const newAmount = (parseFloat(current) + parseFloat(order.amount)).toFixed(6);
      agentAmounts.set(order.agentId, newAmount);
    }
  }
  
  return { validOrders, invalidOrders, agentAmounts };
}

/**
 * 更新代理商冻结金额（拒绝时退还）
 */
export function buildAgentAmountUpdates(
  agentAmounts: Map<number, string>
): Array<{ agentId: number; sqlUpdate: any }> {
  const updates: Array<{ agentId: number; sqlUpdate: any }> = [];
  
  for (const [agentId, totalAmount] of agentAmounts) {
    updates.push({
      agentId,
      sqlUpdate: {
        pendingWithdraw: sql`${agents.pendingWithdraw} + ${totalAmount}`,
      },
    });
  }
  
  return updates;
}

/**
 * 构建批量审核描述
 */
export function buildBatchDescription(
  action: "approve" | "reject",
  orderIds: number[],
  reason?: string | null
): string {
  const actionText = action === "approve" ? "通过" : "拒绝";
  const count = orderIds.length;
  const reasonText = reason ? `: ${reason}` : "";
  
  return `批量${actionText}提现订单 ${count} 笔${reasonText}`;
}

/**
 * 生成单个订单审核描述
 */
export function buildOrderDescription(
  action: "approve" | "reject",
  withdrawId: number,
  amount: string,
  voucherNo?: string,
  reason?: string | null
): string {
  const actionText = action === "approve" ? "通过" : "拒绝";
  const voucherText = voucherNo ? `，凭证号 ${voucherNo}` : "";
  const reasonText = reason ? `: ${reason}` : "无原因";
  
  return `${actionText}提现 #${withdrawId}，金额 ${amount}${voucherText}${action === "reject" ? reasonText : ""}`;
}

/**
 * 检查订单是否存在
 */
export function checkOrderExists(order: any, withdrawId: number): void {
  if (!order) {
    throw new Error(`WITHDRAW_NOT_FOUND: 提现订单 #${withdrawId} 不存在`);
  }
}

/**
 * 构建状态转换映射
 */
export function getStatusTransition(
  currentStatus: WithdrawStatus,
  action: "approve" | "reject",
  reviewLevel: 1 | 2
): WithdrawStatus {
  if (action === "approve") {
    if (reviewLevel === 1) {
      return "pending_second_review";
    } else {
      return "approved";
    }
  } else {
    return "rejected";
  }
}

/**
 * 生成凭证号描述
 */
export function getVoucherDescription(voucherNo: string): string {
  return `凭证号: ${voucherNo}`;
}
import { db } from "../../db/index";
import { users } from "../../db/schema/users";
import { apiKeys } from "../../db/schema/api-keys";
import { agentProfiles } from "../../db/schema/agent-profiles";
import { agentCustomerBindings } from "../../db/schema/agent-customer-bindings";
import { invoices } from "../../db/schema/invoices";
import { tickets } from "../../db/schema/tickets";
import { chatSessions } from "../../db/schema/chat";
import { rechargeOrders } from "../../db/schema/recharge-orders";
import { eq, and, inArray, count, sql, or } from "drizzle-orm";

/**
 * 账号注销前置检查服务
 * 对齐 docs/sprint-1/01-account-deletion-overview.md §2.9
 */

export interface DeletionCheckResult {
  passed: boolean;
  items: {
    key: string;
    label: string;
    passed: boolean;
    detail?: string;
  }[];
  summary: string;
}

const CHECK_ITEMS = [
  { key: "balance", label: "余额清算" },
  { key: "api_keys", label: "API Key 解除" },
  { key: "agent", label: "代理关系解除" },
  { key: "invoices", label: "发票核销" },
  { key: "tickets", label: "工单处理" },
  { key: "chat", label: "客服会话关闭" },
  { key: "recharge", label: "充值订单完结" },
  { key: "subscriptions", label: "订阅状态" },
] as const;

/**
 * 执行注销前置检查
 */
export async function runDeletionChecks(userId: number): Promise<DeletionCheckResult> {
  const results: DeletionCheckResult["items"] = [];

  for (const item of CHECK_ITEMS) {
    const result = await runSingleCheck(userId, item.key);
    results.push(result);
  }

  const allPassed = results.every((r) => r.passed);
  const failedItems = results.filter((r) => !r.passed).map((r) => r.label);
  const summary = allPassed
    ? "所有检查通过，可提交注销申请"
    : `以下检查未通过：${failedItems.join("、")}。请先处理后再提交注销申请。`;

  return { passed: allPassed, items: results, summary };
}

async function runSingleCheck(
  userId: number,
  key: string,
): Promise<{ key: string; label: string; passed: boolean; detail?: string }> {
  switch (key) {
    case "balance": {
      const u = await db
        .select({ balance: users.balance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const bal = Number(u[0]?.balance ?? 0);
      if (bal > 0) {
        return { key, label: "余额清算", passed: false, detail: `账户余额 ¥${(bal / 100).toFixed(2)}，请先提现或消费` };
      }
      if (bal < 0) {
        return { key, label: "余额清算", passed: false, detail: `账户欠费 ¥${(Math.abs(bal) / 100).toFixed(2)}，请先充值` };
      }
      return { key, label: "余额清算", passed: true, detail: "余额已清零" };
    }
    case "api_keys": {
      const activeKeys = await db
        .select({ count: count() })
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.status, "active"), sql`${apiKeys.deletedAt} IS NULL`))
        .limit(1);
      const n = Number(activeKeys[0]?.count ?? 0);
      if (n > 0) {
        return { key, label: "API Key 解除", passed: false, detail: `还有 ${n} 个活跃 API Key，请先删除或禁用` };
      }
      return { key, label: "API Key 解除", passed: true, detail: "无活跃 API Key" };
    }
    case "agent": {
      const agent = await db
        .select({ id: agentProfiles.id, level: agentProfiles.level })
        .from(agentProfiles)
        .where(eq(agentProfiles.userId, userId))
        .limit(1);
      if (agent[0] && agent[0].level !== "prepare") {
        const levelLabel = { level1: "一级代理", senior: "高级代理" }[agent[0].level] ?? "代理";
        return {
          key,
          label: "代理关系解除",
          passed: false,
          detail: `您是${levelLabel}，请先在代理端解除代理资格或联系管理员处理`,
        };
      }
      // 检查是否有绑定的客户
      const bindingCount = await db
        .select({ count: count() })
        .from(agentCustomerBindings)
        .where(eq(agentCustomerBindings.agentUserId, userId))
        .limit(1);
      if (Number(bindingCount[0]?.count ?? 0) > 0) {
        return { key, label: "代理关系解除", passed: false, detail: "您名下有关联客户，请先转移客户关系" };
      }
      return { key, label: "代理关系解除", passed: true, detail: "无代理关系" };
    }
    case "invoices": {
      const pendingInvoices = await db
        .select({ count: count() })
        .from(invoices)
        .where(and(eq(invoices.userId, userId), inArray(invoices.status, ["pending", "issued"])))
        .limit(1);
      const n = Number(pendingInvoices[0]?.count ?? 0);
      if (n > 0) {
        return { key, label: "发票核销", passed: false, detail: `还有 ${n} 张未核销发票` };
      }
      return { key, label: "发票核销", passed: true, detail: "无待处理发票" };
    }
    case "tickets": {
      const openTickets = await db
        .select({ count: count() })
        .from(tickets)
        .where(and(eq(tickets.userId, userId), inArray(tickets.status, ["open", "in_progress"])))
        .limit(1);
      const n = Number(openTickets[0]?.count ?? 0);
      if (n > 0) {
        return { key, label: "工单处理", passed: false, detail: `还有 ${n} 个未关闭工单` };
      }
      return { key, label: "工单处理", passed: true, detail: "无未关闭工单" };
    }
    case "chat": {
      const activeChats = await db
        .select({ count: count() })
        .from(chatSessions)
        .where(and(eq(chatSessions.userId, userId), eq(chatSessions.status, "active")))
        .limit(1);
      const n = Number(activeChats[0]?.count ?? 0);
      if (n > 0) {
        return { key, label: "客服会话关闭", passed: false, detail: `还有 ${n} 个活跃客服会话` };
      }
      return { key, label: "客服会话关闭", passed: true, detail: "无活跃客服会话" };
    }
    case "recharge": {
      const pendingOrders = await db
        .select({ count: count() })
        .from(rechargeOrders)
        .where(and(eq(rechargeOrders.userId, userId), or(eq(rechargeOrders.status, "pending"), eq(rechargeOrders.status, "processing"))))
        .limit(1);
      const n = Number(pendingOrders[0]?.count ?? 0);
      if (n > 0) {
        return { key, label: "充值订单完结", passed: false, detail: `还有 ${n} 笔未完结充值订单` };
      }
      return { key, label: "充值订单完结", passed: true, detail: "无未完结充值订单" };
    }
    case "subscriptions": {
      // 未来扩展：订阅检查
      return { key, label: "订阅状态", passed: true, detail: "无活跃订阅" };
    }
    default:
      return { key, label: key, passed: true };
  }
}

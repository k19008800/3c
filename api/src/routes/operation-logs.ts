// ============================================================
//  3cloud (3C) — 用户端操作日志
//  GET /api/v1/me/operation-logs — 当前用户的操作记录
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { operationLogs } from "../db/schema.js";
import { authenticateJWT } from "../middleware/auth.js";

const CATEGORY_LABELS: Record<string, string> = {
  auth: "认证登录",
  api_key: "API 密钥",
  finance: "财务交易",
  profile: "账户设置",
  agent: "代理商",
  system: "系统操作",
};

const ACTION_LABELS: Record<string, string> = {
  login: "用户登录",
  logout: "用户登出",
  register: "用户注册",
  change_password: "修改密码",
  oauth_bind: "OAuth 绑定",
  oauth_unbind: "OAuth 解绑",
  api_key_create: "创建 API Key",
  api_key_delete: "删除 API Key",
  api_key_rename: "重命名 API Key",
  api_key_reset: "重置 API Key",
  recharge_submit: "提交充值",
  redemption_use: "使用兑换码",
  withdraw_request: "发起提现",
  invoice_apply: "申请发票",
  refund_apply: "申请退款",
  realname_submit: "提交实名认证",
  profile_update: "更新个人资料",
  security_setup: "安全设置变更",
  agent_client_create: "创建客户",
  agent_client_update: "编辑客户",
  agent_quota_adjust: "调整额度",
  agent_withdraw: "代理商提现",
  agent_redemption_create: "生成兑换码",
};

export async function userOperationLogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/operation-logs
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/operation-logs", async (request, reply) => {
    const db = getDb();
    const user = (request as any).user;
    const query = request.query as {
      page?: string;
      pageSize?: string;
      category?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [
      eq(operationLogs.userId, user.id),
    ];

    if (query.category) {
      conditions.push(eq(operationLogs.category, query.category as any));
    }
    if (query.action) {
      conditions.push(eq(operationLogs.action, query.action));
    }
    if (query.startDate) {
      conditions.push(gte(operationLogs.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(operationLogs.createdAt, end));
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(operationLogs)
      .where(and(...conditions));

    const rows = await db
      .select({
        id: operationLogs.id,
        category: operationLogs.category,
        action: operationLogs.action,
        targetType: operationLogs.targetType,
        targetId: operationLogs.targetId,
        resourceName: operationLogs.resourceName,
        summary: operationLogs.summary,
        status: operationLogs.status,
        errorReason: operationLogs.errorReason,
        ip: operationLogs.ip,
        createdAt: operationLogs.createdAt,
      })
      .from(operationLogs)
      .where(and(...conditions))
      .orderBy(desc(operationLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    const list = rows.map((r) => ({
      id: r.id,
      category: r.category,
      categoryLabel: CATEGORY_LABELS[r.category] || r.category,
      action: r.action,
      actionLabel: ACTION_LABELS[r.action] || r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      resourceName: r.resourceName,
      summary: r.summary,
      status: r.status,
      errorReason: r.errorReason,
      ip: r.ip,
      createdAt: (r.createdAt as Date).toISOString(),
    }));

    reply.send({
      code: 0,
      data: {
        list,
        total: countResult.count,
        page,
        pageSize,
      },
      message: "ok",
    });
  });
}

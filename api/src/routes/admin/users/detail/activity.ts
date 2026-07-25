// ============================================================
//  3cloud (3C) — 用户操作轨迹
//  GET  /api/v1/admin/users/:id/activity          — 操作轨迹列表
//  GET  /api/v1/admin/users/:id/activity/export   — CSV 导出
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lt, inArray } from "drizzle-orm";
import { getDb } from "../../../../db/index.js";
import { operationLogs, users } from "../../../../db/schema.js";
import { requirePerm, Perm } from "../../../../middleware/auth.js";
import { validateUserId, type PageQuery } from "./types.js";

// ── 操作分类中文标签 ──

const CATEGORY_LABELS: Record<string, string> = {
  auth: "认证登录",
  api_key: "API 密钥",
  finance: "财务交易",
  profile: "账户设置",
  agent: "代理商",
  system: "系统操作",
};

// ── 操作类型中文标签 ──

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

// ── 操作类型图标映射 ──

const ACTION_ICONS: Record<string, string> = {
  login: "🔐",
  logout: "🚪",
  register: "📝",
  change_password: "🔑",
  oauth_bind: "🔗",
  oauth_unbind: "🔓",
  api_key_create: "🔑",
  api_key_delete: "🗑️",
  api_key_rename: "✏️",
  api_key_reset: "🔄",
  recharge_submit: "💰",
  redemption_use: "🎟️",
  withdraw_request: "💸",
  invoice_apply: "📄",
  refund_apply: "↩️",
  realname_submit: "🪪",
  profile_update: "👤",
  security_setup: "🛡️",
  agent_client_create: "👥",
  agent_client_update: "✏️",
  agent_quota_adjust: "📊",
  agent_withdraw: "💸",
  agent_redemption_create: "🎫",
};

// ── 查询参数类型 ──

interface ActivityQuery extends PageQuery {
  category?: string;      // 操作分类
  action?: string;        // 操作类型
  status?: string;        // success | failure | pending
  startDate?: string;     // 开始日期
  endDate?: string;       // 结束日期
}

export function registerActivityRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/activity — 操作轨迹列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/activity", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const query = request.query as ActivityQuery;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    // 构建查询条件
    const conditions: any[] = [eq(operationLogs.userId, userId)];

    if (query.category) {
      conditions.push(eq(operationLogs.category, query.category as any));
    }

    if (query.action) {
      conditions.push(eq(operationLogs.action, query.action));
    }

    if (query.status) {
      conditions.push(eq(operationLogs.status, query.status));
    }

    if (query.startDate) {
      conditions.push(gte(operationLogs.createdAt, new Date(query.startDate)));
    }

    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(operationLogs.createdAt, end));
    }

    // 总条数
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(operationLogs)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    // 主数据
    const rows = await db
      .select({
        id: operationLogs.id,
        userId: operationLogs.userId,
        userRole: operationLogs.userRole,
        category: operationLogs.category,
        action: operationLogs.action,
        targetType: operationLogs.targetType,
        targetId: operationLogs.targetId,
        resourceName: operationLogs.resourceName,
        summary: operationLogs.summary,
        metadata: operationLogs.metadata,
        status: operationLogs.status,
        errorReason: operationLogs.errorReason,
        ip: operationLogs.ip,
        userAgent: operationLogs.userAgent,
        createdAt: operationLogs.createdAt,
      })
      .from(operationLogs)
      .where(and(...conditions))
      .orderBy(desc(operationLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    const list = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userRole: r.userRole,
      category: r.category,
      categoryLabel: CATEGORY_LABELS[r.category] || r.category,
      action: r.action,
      actionLabel: ACTION_LABELS[r.action] || r.action,
      actionIcon: ACTION_ICONS[r.action] || "📌",
      targetType: r.targetType,
      targetId: r.targetId,
      resourceName: r.resourceName,
      summary: r.summary,
      metadata: r.metadata,
      status: r.status,
      errorReason: r.errorReason,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
    }));

    // 统计各分类数量
    const categoryStats = await db
      .select({
        category: operationLogs.category,
        count: sql<number>`count(*)::int`,
      })
      .from(operationLogs)
      .where(eq(operationLogs.userId, userId))
      .groupBy(operationLogs.category);

    const stats = {
      total: categoryStats.reduce((sum, c) => sum + c.count, 0),
      byCategory: categoryStats.reduce((acc, c) => {
        acc[c.category] = c.count;
        return acc;
      }, {} as Record<string, number>),
    };

    reply.status(200).send({
      code: 0,
      data: {
        list,
        total,
        page,
        pageSize,
        stats,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/activity/export — CSV 导出
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/activity/export", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const query = request.query as Omit<ActivityQuery, "page" | "pageSize">;

    // 构建查询条件
    const conditions: any[] = [eq(operationLogs.userId, userId)];

    if (query.category) {
      conditions.push(eq(operationLogs.category, query.category as any));
    }

    if (query.action) {
      conditions.push(eq(operationLogs.action, query.action));
    }

    if (query.status) {
      conditions.push(eq(operationLogs.status, query.status));
    }

    if (query.startDate) {
      conditions.push(gte(operationLogs.createdAt, new Date(query.startDate)));
    }

    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(operationLogs.createdAt, end));
    }

    const rows = await db
      .select({
        createdAt: operationLogs.createdAt,
        category: operationLogs.category,
        action: operationLogs.action,
        targetType: operationLogs.targetType,
        targetId: operationLogs.targetId,
        resourceName: operationLogs.resourceName,
        summary: operationLogs.summary,
        status: operationLogs.status,
        errorReason: operationLogs.errorReason,
        ip: operationLogs.ip,
        userAgent: operationLogs.userAgent,
      })
      .from(operationLogs)
      .where(and(...conditions))
      .orderBy(desc(operationLogs.createdAt));

    // CSV 转义
    const esc = (v: string | null | undefined) => {
      const s = (v ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };

    const header = "时间,操作分类,操作类型,对象类型,对象ID,资源名,摘要,结果,失败原因,IP,User-Agent\n";
    const lines = rows.map((r) => {
      const catLabel = CATEGORY_LABELS[r.category] || r.category;
      const actLabel = ACTION_LABELS[r.action] || r.action;
      return [
        esc(r.createdAt.toISOString()),
        esc(catLabel),
        esc(actLabel),
        esc(r.targetType),
        r.targetId != null ? `${r.targetId}` : "",
        esc(r.resourceName),
        esc(r.summary),
        esc(r.status),
        esc(r.errorReason),
        esc(r.ip),
        esc(r.userAgent),
      ].join(",");
    });

    const csvContent = "\uFEFF" + header + lines.join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="user_${userId}_activity_${new Date().toISOString().slice(0, 10)}.csv"`);
    reply.send(csvContent);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/activity/summary — 操作统计摘要
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/activity/summary", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    // 最近 7 天操作趋势
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trends = await db
      .select({
        date: sql<string>`to_char(${operationLogs.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(operationLogs)
      .where(and(
        eq(operationLogs.userId, userId),
        gte(operationLogs.createdAt, sevenDaysAgo)
      ))
      .groupBy(sql`to_char(${operationLogs.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${operationLogs.createdAt}, 'YYYY-MM-DD')`);

    // 操作类型分布
    const byAction = await db
      .select({
        action: operationLogs.action,
        count: sql<number>`count(*)::int`,
      })
      .from(operationLogs)
      .where(eq(operationLogs.userId, userId))
      .groupBy(operationLogs.action)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // 成功/失败统计
    const byStatus = await db
      .select({
        status: operationLogs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(operationLogs)
      .where(eq(operationLogs.userId, userId))
      .groupBy(operationLogs.status);

    reply.status(200).send({
      code: 0,
      data: {
        trends: trends.map(t => ({
          date: t.date,
          count: t.count,
        })),
        byAction: byAction.map(a => ({
          action: a.action,
          actionLabel: ACTION_LABELS[a.action] || a.action,
          count: a.count,
        })),
        byStatus: byStatus.reduce((acc, s) => {
          acc[s.status] = s.count;
          return acc;
        }, {} as Record<string, number>),
      },
      message: "ok",
    });
  });
}

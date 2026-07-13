// ============================================================
//  3cloud (3C) — Admin 操作日志
//  GET  /api/v1/admin/operation-logs          — 操作日志列表
//  GET  /api/v1/admin/operation-logs/export   — CSV 导出
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lt, like, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { operationLogs, users } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

// ── 分类/操作中文标签 ──

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

export async function adminOperationLogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operation-logs — 列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/operation-logs", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      keyword?: string;
      category?: string;
      action?: string;
      userId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [sql`1=1`];

    if (query.keyword) {
      const kw = `%${query.keyword}%`;
      conditions.push(sql`(
        ${operationLogs.summary} ILIKE ${kw}
        OR ${operationLogs.userId} IN (
          SELECT ${users.id} FROM ${users}
          WHERE ${users.email} ILIKE ${kw}
             OR ${users.nickname} ILIKE ${kw}
        )
      )`);
    }

    if (query.category) {
      conditions.push(eq(operationLogs.category, query.category as any));
    }

    if (query.action) {
      conditions.push(eq(operationLogs.action, query.action));
    }

    if (query.userId) {
      const uid = parseInt(query.userId, 10);
      if (!isNaN(uid)) {
        conditions.push(eq(operationLogs.userId, uid));
      }
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

    // 主数据
    const rows = await db
      .select({
        id: operationLogs.id,
        userId: operationLogs.userId,
        userEmail: users.email,
        userNickname: users.nickname,
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
      .leftJoin(users, eq(operationLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(operationLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    const list = rows.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.userEmail,
      userNickname: r.userNickname,
      userRole: r.userRole,
      category: r.category,
      categoryLabel: CATEGORY_LABELS[r.category] || r.category,
      action: r.action,
      actionLabel: ACTION_LABELS[r.action] || r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      resourceName: r.resourceName,
      summary: r.summary,
      metadata: r.metadata,
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

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operation-logs/export — CSV
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/operation-logs/export", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      keyword?: string;
      category?: string;
      action?: string;
      userId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    };

    const conditions: any[] = [sql`1=1`];

    if (query.keyword) {
      const kw = `%${query.keyword}%`;
      conditions.push(sql`(
        ${operationLogs.summary} ILIKE ${kw}
        OR ${operationLogs.userId} IN (
          SELECT ${users.id} FROM ${users}
          WHERE ${users.email} ILIKE ${kw}
             OR ${users.nickname} ILIKE ${kw}
        )
      )`);
    }
    if (query.category) conditions.push(eq(operationLogs.category, query.category as any));
    if (query.action) conditions.push(eq(operationLogs.action, query.action));
    if (query.userId) {
      const uid = parseInt(query.userId, 10);
      if (!isNaN(uid)) conditions.push(eq(operationLogs.userId, uid));
    }
    if (query.status) conditions.push(eq(operationLogs.status, query.status));
    if (query.startDate) conditions.push(gte(operationLogs.createdAt, new Date(query.startDate)));
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(operationLogs.createdAt, end));
    }

    const rows = await db
      .select({
        createdAt: operationLogs.createdAt,
        userEmail: users.email,
        userNickname: users.nickname,
        userRole: operationLogs.userRole,
        category: operationLogs.category,
        action: operationLogs.action,
        targetType: operationLogs.targetType,
        targetId: operationLogs.targetId,
        resourceName: operationLogs.resourceName,
        summary: operationLogs.summary,
        status: operationLogs.status,
        errorReason: operationLogs.errorReason,
        ip: operationLogs.ip,
      })
      .from(operationLogs)
      .leftJoin(users, eq(operationLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(operationLogs.createdAt));

    const esc = (v: string | null | undefined) => {
      const s = (v ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };

    const header = "时间,用户邮箱,用户昵称,角色,操作分类,操作类型,对象类型,对象ID,资源名,摘要,结果,失败原因,IP\n";
    const lines = rows.map((r: any) => {
      const catLabel = CATEGORY_LABELS[r.category] || r.category;
      const actLabel = ACTION_LABELS[r.action] || r.action;
      const operator = r.userNickname || r.userEmail || "";
      return [
        esc((r.createdAt as Date).toISOString()),
        esc(r.userEmail),
        esc(operator),
        esc(r.userRole),
        esc(catLabel),
        esc(actLabel),
        esc(r.targetType),
        r.targetId != null ? `${r.targetId}` : "",
        esc(r.resourceName),
        esc(r.summary),
        esc(r.status),
        esc(r.errorReason),
        esc(r.ip),
      ].join(",");
    });

    const csvContent = "\uFEFF" + header + lines.join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="operation-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
    reply.send(csvContent);
  });
}

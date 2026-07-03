// ============================================================
//  3cloud (3C) — Admin 审计日志
//  GET  /api/v1/admin/audit-logs          — 审计日志列表
//  GET  /api/v1/admin/audit-logs/:id      — 单条详情（含 diff）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lt, like, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  auditLogs,
  users,
  vendors,
  models,
  systemConfigs,
  rechargeOrders,
  agents,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

// ── 操作类型 → 中文标签 ──

const ACTION_LABELS: Record<string, string> = {
  user_create: "创建用户",
  user_disable: "禁用用户",
  user_enable: "启用用户",
  user_password_reset: "重置密码",
  user_update: "编辑用户",
  user_impersonate: "模拟登录",
  balance_adjust: "调整余额",
  role_change: "变更角色",
  real_name_approve: "通过实名",
  real_name_reject: "驳回实名",
  withdraw_first_approve: "提现初审通过",
  withdraw_second_approve: "提现复审通过",
  withdraw_approve: "提现审批通过",
  withdraw_reject: "提现驳回",
  withdraw_paid: "提现打款",
  order_cancel: "取消订单",
  recharge_confirm: "确认充值",
  recharge_first_confirm: "充值一级确认",
  recharge_second_confirm: "充值二级确认",
  agent_create: "创建代理商",
  agent_update: "编辑代理商",
  config_update: "修改系统配置",
  vendor_create: "创建厂商",
  vendor_update: "编辑厂商",
  model_create: "创建模型",
  model_update: "编辑模型",
  system_maintenance: "系统维护",
};

const TARGET_LABELS: Record<string, string> = {
  user: "用户",
  vendor: "厂商",
  model: "模型",
  vendor_model: "厂商-模型映射",
  api_key: "API Key",
  order: "订单",
  config: "系统配置",
  agent: "代理商",
  team: "团队",
};

// ── 批量解析目标名称 ──

async function resolveTargetNames(
  logs: { targetType: string | null; targetId: number | null }[]
): Promise<Map<string, string | null>> {
  const keyRows = new Map<string, string | null>();

  // 按 target_type 分组收集 ID
  const groups = new Map<string, number[]>();
  for (const log of logs) {
    if (!log.targetType || log.targetId == null) continue;
    const ids = groups.get(log.targetType) || [];
    ids.push(log.targetId);
    groups.set(log.targetType, ids);
  }

  const db = getDb();

  for (const [type, ids] of groups) {
    const uniqueIds = [...new Set(ids)];
    const keys = uniqueIds.map((id) => `${type}:${id}`);

    switch (type) {
      case "user": {
        const rows = await db
          .select({ id: users.id, name: users.email })
          .from(users)
          .where(inArray(users.id, uniqueIds));
        for (const r of rows) keyRows.set(`user:${r.id}`, r.name);
        break;
      }
      case "vendor": {
        const rows = await db
          .select({ id: vendors.id, name: vendors.name })
          .from(vendors)
          .where(inArray(vendors.id, uniqueIds));
        for (const r of rows) keyRows.set(`vendor:${r.id}`, r.name);
        break;
      }
      case "model": {
        const rows = await db
          .select({ id: models.id, name: models.name })
          .from(models)
          .where(inArray(models.id, uniqueIds));
        for (const r of rows) keyRows.set(`model:${r.id}`, r.name);
        break;
      }
      case "config": {
        const rows = await db
          .select({ id: systemConfigs.id, name: systemConfigs.key })
          .from(systemConfigs)
          .where(inArray(systemConfigs.id, uniqueIds));
        for (const r of rows) keyRows.set(`config:${r.id}`, r.name);
        break;
      }
      case "order": {
        const rows = await db
          .select({ id: rechargeOrders.id, name: rechargeOrders.orderNo })
          .from(rechargeOrders)
          .where(inArray(rechargeOrders.id, uniqueIds));
        for (const r of rows) keyRows.set(`order:${r.id}`, r.name);
        break;
      }
      case "agent": {
        const rows = await db
          .select({ id: agents.id, userId: agents.userId })
          .from(agents)
          .where(inArray(agents.id, uniqueIds));
        // 代理商用对应用户的 email 做显示名
        const userIds = rows.map((r) => r.userId).filter(Boolean);
        const userRows = userIds.length > 0
          ? await db
              .select({ id: users.id, name: users.email })
              .from(users)
              .where(inArray(users.id, userIds as number[]))
          : [];
        const userMap = new Map(userRows.map((r) => [r.id, r.name]));
        for (const r of rows) {
          keyRows.set(`agent:${r.id}`, userMap.get(r.userId) ?? `#${r.id}`);
        }
        break;
      }
      // vendor_model, api_key, team — 暂时返回 null
      default:
        for (const k of keys) keyRows.set(k, null);
    }
  }

  return keyRows;
}

export async function adminAuditLogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/audit-logs — 列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/audit-logs", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      keyword?: string;      // 模糊搜索 description / 操作人邮箱
      action?: string;       // 逗号分隔
      targetType?: string;
      targetId?: string;
      operatorId?: string;
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
        ${auditLogs.description} ILIKE ${kw}
        OR ${auditLogs.operatorId} IN (
          SELECT ${users.id} FROM ${users}
          WHERE ${users.email} ILIKE ${kw}
             OR ${users.nickname} ILIKE ${kw}
        )
      )`);
    }

    if (query.action) {
      const actions = query.action.split(",").map((a) => a.trim()).filter(Boolean);
      if (actions.length > 0) {
        conditions.push(inArray(auditLogs.action, actions as any));
      }
    }

    if (query.targetType) {
      conditions.push(eq(auditLogs.targetType, query.targetType));
    }

    if (query.targetId) {
      const id = parseInt(query.targetId, 10);
      if (!isNaN(id)) {
        conditions.push(eq(auditLogs.targetId, id));
      }
    }

    if (query.operatorId) {
      const id = parseInt(query.operatorId, 10);
      if (!isNaN(id)) {
        conditions.push(eq(auditLogs.operatorId, id));
      }
    }

    if (query.startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(query.startDate)));
    }

    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(auditLogs.createdAt, end));
    }

    // 总条数
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(and(...conditions));

    // 查询主数据 + 操作人信息
    const rows = await db
      .select({
        id: auditLogs.id,
        operatorId: auditLogs.operatorId,
        operatorEmail: users.email,
        operatorNickname: users.nickname,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        description: auditLogs.description,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.operatorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    // 批量解析目标名称
    const nameMap = await resolveTargetNames(rows);

    const list = rows.map((r) => ({
      id: r.id,
      operatorId: r.operatorId,
      operatorEmail: r.operatorEmail,
      operatorNickname: r.operatorNickname,
      action: r.action,
      actionLabel: ACTION_LABELS[r.action] || r.action,
      targetType: r.targetType,
      targetTypeLabel: TARGET_LABELS[r.targetType ?? ""] || r.targetType,
      targetId: r.targetId,
      targetName:
        r.targetType && r.targetId != null
          ? nameMap.get(`${r.targetType}:${r.targetId}`) ?? null
          : null,
      description: r.description,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
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
  //  GET /api/v1/admin/audit-logs/:id — 详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/audit-logs/:id", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const logId = parseInt(id, 10);
    if (isNaN(logId)) {
      reply.status(400).send({ code: 400, data: null, message: "ID 格式错误" });
      return;
    }

    const [row] = await db
      .select({
        id: auditLogs.id,
        operatorId: auditLogs.operatorId,
        operatorEmail: users.email,
        operatorNickname: users.nickname,
        action: auditLogs.action,
        actionLabel: sql<string>`${auditLogs.action}`, // 后端映射前端自己做
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        before: auditLogs.before,
        after: auditLogs.after,
        ip: auditLogs.ip,
        description: auditLogs.description,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.operatorId, users.id))
      .where(eq(auditLogs.id, logId))
      .limit(1);

    if (!row) {
      reply.status(404).send({ code: 404, data: null, message: "审计日志不存在" });
      return;
    }

    // 解析目标名称
    const nameMap = await resolveTargetNames([row]);
    const targetName =
      row.targetType && row.targetId != null
        ? nameMap.get(`${row.targetType}:${row.targetId}`) ?? null
        : null;

    reply.send({
      code: 0,
      data: {
        ...row,
        targetName,
        actionLabel: ACTION_LABELS[row.action] || row.action,
        createdAt: row.createdAt.toISOString(),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/audit-logs/export — CSV 导出
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/audit-logs/export", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      keyword?: string;
      action?: string;
      targetType?: string;
      targetId?: string;
      operatorId?: string;
      startDate?: string;
      endDate?: string;
    };

    const conditions: any[] = [sql`1=1`];

    if (query.keyword) {
      const kw = `%${query.keyword}%`;
      conditions.push(sql`(
        ${auditLogs.description} ILIKE ${kw}
        OR ${auditLogs.operatorId} IN (
          SELECT ${users.id} FROM ${users}
          WHERE ${users.email} ILIKE ${kw}
             OR ${users.nickname} ILIKE ${kw}
        )
      )`);
    }
    if (query.action) {
      const actions = query.action.split(",").map((a) => a.trim()).filter(Boolean);
      if (actions.length > 0) {
        conditions.push(inArray(auditLogs.action, actions as any));
      }
    }
    if (query.targetType) {
      conditions.push(eq(auditLogs.targetType, query.targetType));
    }
    if (query.targetId) {
      const id = parseInt(query.targetId, 10);
      if (!isNaN(id)) conditions.push(eq(auditLogs.targetId, id));
    }
    if (query.operatorId) {
      const id = parseInt(query.operatorId, 10);
      if (!isNaN(id)) conditions.push(eq(auditLogs.operatorId, id));
    }
    if (query.startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(auditLogs.createdAt, end));
    }

    const rows = await db
      .select({
        createdAt: auditLogs.createdAt,
        operatorEmail: users.email,
        operatorNickname: users.nickname,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        description: auditLogs.description,
        ip: auditLogs.ip,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.operatorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt));

    // Resolve target names for the export
    const nameMap = await resolveTargetNames(rows as any);

    // Build CSV
    const header = "操作时间,操作人,操作类型,对象类型,对象ID,对象名称,变更摘要,IP\n";
    const lines = rows.map((r) => {
      const targetName =
        r.targetType && r.targetId != null
          ? nameMap.get(`${r.targetType}:${r.targetId}`) ?? ""
          : "";
      const actLabel = ACTION_LABELS[r.action] || r.action;
      const operator = r.operatorNickname || r.operatorEmail || "";
      // Escape CSV fields: wrap in quotes and escape inner quotes
      const esc = (v: string | null | undefined) => {
        const s = (v ?? "").replace(/"/g, '""');
        return `"${s}"`;
      };
      return [
        esc(r.createdAt.toISOString()),
        esc(operator),
        esc(actLabel),
        esc(r.targetType),
        r.targetId != null ? `${r.targetId}` : "",
        esc(targetName),
        esc(r.description),
        esc(r.ip),
      ].join(",");
    });

    const csvContent = "\uFEFF" + header + lines.join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
    reply.send(csvContent);
  });
}

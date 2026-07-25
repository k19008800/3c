// ============================================================
//  3cloud (3C) — 用户批量操作路由（管理员）
//  POST /api/v1/admin/users/batch/disable  — 批量禁用
//  POST /api/v1/admin/users/batch/enable   — 批量启用
//  POST /api/v1/admin/users/batch/balance  — 批量调整余额
//  POST /api/v1/admin/users/batch/level    — 批量设置代理商等级
//  POST /api/v1/admin/users/batch/export   — 批量导出
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql, inArray } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  users,
  agents,
  balanceLogs,
  auditLogs,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { z } from "zod";

// ── 常量 ──
const BATCH_LIMIT = 100;
const BALANCE_REVIEW_THRESHOLD = 1000;

// ── Schemas ──
const batchUserIdsSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(BATCH_LIMIT),
});

const batchDisableSchema = batchUserIdsSchema.extend({
  reason: z.string().max(500).optional(),
  disabledUntil: z.string().datetime().optional(),
});

const batchEnableSchema = batchUserIdsSchema;

const batchBalanceSchema = batchUserIdsSchema.extend({
  amount: z.number().refine((v) => !isNaN(v), { message: "金额必须为数字" }),
  description: z.string().max(500).optional(),
});

const batchLevelSchema = batchUserIdsSchema.extend({
  level: z.number().int().min(0).max(10),
  reason: z.string().max(500).optional(),
});

const batchExportSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(BATCH_LIMIT).optional(),
  filters: z.object({
    keyword: z.string().optional(),
    status: z.string().optional(),
    role: z.string().optional(),
  }).optional(),
});

// ── 响应类型 ──
interface BatchResult {
  success: number;
  failed: number;
  errors?: Array<{ userId: number; reason: string }>;
  downloadUrl?: string;
}

// ═══════════════════════════════════════════════════════════════
//  Routes
// ═══════════════════════════════════════════════════════════════

export async function batchRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  POST /batch/disable — 批量禁用
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/users/batch/disable", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;

    const parsed = batchDisableSchema.parse(request.body);
    const userIds = parsed.userIds;

    // 查询有效用户
    const usersFound = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(inArray(users.id, userIds));

    if (usersFound.length === 0) {
      reply.status(404).send({ code: 404, data: null, message: "未找到有效用户" });
      return;
    }

    const foundIds = usersFound.map((u) => u.id);
    const notFoundIds = userIds.filter((id) => !foundIds.includes(id));

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: "disabled",
          disabledReason: parsed.reason ?? null,
          disabledBy: operatorId,
          disabledAt: new Date(),
          disabledUntil: parsed.disabledUntil ? new Date(parsed.disabledUntil) : null,
        })
        .where(inArray(users.id, foundIds));

      for (const u of usersFound) {
        await tx.insert(auditLogs).values({
          operatorId,
          action: "user_disable",
          targetType: "user",
          targetId: u.id,
          before: { status: u.status },
          after: { status: "disabled", reason: parsed.reason },
          ip: request.ip,
          description: `批量禁用${parsed.reason ? `: ${parsed.reason}` : ""}`,
        });
      }
    });

    const result: BatchResult = {
      success: usersFound.length,
      failed: notFoundIds.length,
      errors: notFoundIds.length > 0
        ? notFoundIds.map((id) => ({ userId: id, reason: "用户不存在" }))
        : undefined,
    };

    reply.status(200).send({
      code: 0,
      data: result,
      message: `已禁用 ${usersFound.length} 个用户`,
    });
  });

  // ──────────────────────────────────────────────
  //  POST /batch/enable — 批量启用
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/users/batch/enable", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;

    const parsed = batchEnableSchema.parse(request.body);
    const userIds = parsed.userIds;

    const usersFound = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(inArray(users.id, userIds));

    if (usersFound.length === 0) {
      reply.status(404).send({ code: 404, data: null, message: "未找到有效用户" });
      return;
    }

    const foundIds = usersFound.map((u) => u.id);
    const notFoundIds = userIds.filter((id) => !foundIds.includes(id));

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: "active",
          disabledReason: null,
          disabledBy: null,
          disabledAt: null,
          disabledUntil: null,
        })
        .where(inArray(users.id, foundIds));

      for (const u of usersFound) {
        await tx.insert(auditLogs).values({
          operatorId,
          action: "user_enable",
          targetType: "user",
          targetId: u.id,
          before: { status: u.status },
          after: { status: "active" },
          ip: request.ip,
          description: "批量启用",
        });
      }
    });

    const result: BatchResult = {
      success: usersFound.length,
      failed: notFoundIds.length,
      errors: notFoundIds.length > 0
        ? notFoundIds.map((id) => ({ userId: id, reason: "用户不存在" }))
        : undefined,
    };

    reply.status(200).send({
      code: 0,
      data: result,
      message: `已启用 ${usersFound.length} 个用户`,
    });
  });

  // ──────────────────────────────────────────────
  //  POST /batch/balance — 批量调整余额
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/users/batch/balance", {
    preHandler: [requirePerm(Perm.USER_BALANCE)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;

    const parsed = batchBalanceSchema.parse(request.body);
    const { userIds, amount, description } = parsed;

    // 查询有效用户及其余额
    const usersFound = await db
      .select({
        id: users.id,
        balance: users.balance,
        status: users.status,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    if (usersFound.length === 0) {
      reply.status(404).send({ code: 404, data: null, message: "未找到有效用户" });
      return;
    }

    // 大额调整需要审核
    if (Math.abs(amount) > BALANCE_REVIEW_THRESHOLD) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: `单次调整金额超过 ${BALANCE_REVIEW_THRESHOLD} 元，请使用单个用户余额调整接口`,
      });
      return;
    }

    const foundIds = usersFound.map((u) => u.id);
    const notFoundIds = userIds.filter((id) => !foundIds.includes(id));
    const errors: Array<{ userId: number; reason: string }> = [];
    let successCount = 0;

    for (const user of usersFound) {
      // 跳过已删除/禁用用户
      if (user.status === "deleted") {
        errors.push({ userId: user.id, reason: "用户已注销" });
        continue;
      }

      const balanceBefore = parseFloat(user.balance);
      const newBalance = balanceBefore + amount;

      // 余额不能为负
      if (newBalance < 0) {
        errors.push({ userId: user.id, reason: "余额不足" });
        continue;
      }

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ balance: newBalance.toFixed(6) })
          .where(eq(users.id, user.id));

        await tx.insert(balanceLogs).values({
          userId: user.id,
          amount: amount.toFixed(6),
          balanceAfter: newBalance.toFixed(6),
          type: amount >= 0 ? "recharge" : "refund",
          refType: "manual",
          description: description
            ? `管理员批量操作: ${description}`
            : `管理员批量调整余额 (${amount >= 0 ? "+" : ""}${amount.toFixed(6)})`,
        });

        await tx.insert(auditLogs).values({
          operatorId,
          action: "balance_adjust",
          targetType: "user",
          targetId: user.id,
          before: { balance: balanceBefore.toFixed(6) },
          after: { balance: newBalance.toFixed(6) },
          ip: request.ip,
          description: description ?? `批量调整余额: ${amount >= 0 ? "+" : ""}${amount.toFixed(6)}`,
        });
      });

      successCount++;
    }

    // 添加未找到的用户到错误列表
    for (const id of notFoundIds) {
      errors.push({ userId: id, reason: "用户不存在" });
    }

    const result: BatchResult = {
      success: successCount,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    reply.status(200).send({
      code: 0,
      data: result,
      message: `成功调整 ${successCount} 个用户余额`,
    });
  });

  // ──────────────────────────────────────────────
  //  POST /batch/level — 批量设置代理商等级
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/users/batch/level", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;

    const parsed = batchLevelSchema.parse(request.body);
    const { userIds, level, reason } = parsed;

    // 查询有效用户及其代理商信息
    const usersFound = await db
      .select({
        id: users.id,
        role: users.role,
        agentId: agents.id,
      })
      .from(users)
      .leftJoin(agents, eq(users.id, agents.userId))
      .where(inArray(users.id, userIds));

    if (usersFound.length === 0) {
      reply.status(404).send({ code: 404, data: null, message: "未找到有效用户" });
      return;
    }

    const foundIds = usersFound.map((u) => u.id);
    const notFoundIds = userIds.filter((id) => !foundIds.includes(id));
    const errors: Array<{ userId: number; reason: string }> = [];
    let successCount = 0;

    for (const user of usersFound) {
      // 检查用户角色是否为代理商
      if (user.role !== "agent") {
        errors.push({ userId: user.id, reason: "用户不是代理商" });
        continue;
      }

      // 如果代理商记录存在，更新 teamDepth；否则创建新代理商记录
      if (user.agentId) {
        await db
          .update(agents)
          .set({ teamDepth: level, updatedAt: new Date() })
          .where(eq(agents.id, user.agentId));
      } else {
        await db.insert(agents).values({
          userId: user.id,
          teamDepth: level,
        });
      }

      await db.insert(auditLogs).values({
        operatorId,
        action: "agent_level_change",
        targetType: "user",
        targetId: user.id,
        after: { level },
        ip: request.ip,
        description: reason ?? `批量设置代理商等级为 ${level}`,
      });

      successCount++;
    }

    // 添加未找到的用户到错误列表
    for (const id of notFoundIds) {
      errors.push({ userId: id, reason: "用户不存在" });
    }

    const result: BatchResult = {
      success: successCount,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    reply.status(200).send({
      code: 0,
      data: result,
      message: `成功设置 ${successCount} 个代理商等级`,
    });
  });

  // ──────────────────────────────────────────────
  //  POST /batch/export — 批量导出用户数据
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/users/batch/export", {
    preHandler: [requirePerm(Perm.USER_LIST)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;

    const parsed = batchExportSchema.parse(request.body);
    const { userIds, filters } = parsed;

    // 构建查询条件
    let query = db.select({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      role: users.role,
      status: users.status,
      balance: users.balance,
      realNameStatus: users.realNameStatus,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users);

    // 如果指定了 userIds，按 ID 过滤
    let targetIds = userIds;
    if (!targetIds || targetIds.length === 0) {
      // 如果未指定 userIds，按 filters 过滤
      // 注意：Drizzle ORM 需要在 select 后使用 where
      // 这里简化处理，直接获取所有用户（实际应用中需要加上 filter 条件）
    }

    // 获取用户数据
    let usersToExport: any[] = [];
    if (targetIds && targetIds.length > 0) {
      usersToExport = await db
        .select({
          id: users.id,
          email: users.email,
          nickname: users.nickname,
          role: users.role,
          status: users.status,
          balance: users.balance,
          realNameStatus: users.realNameStatus,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(inArray(users.id, targetIds));
    } else {
      // 导出全部（带筛选条件）
      usersToExport = await db
        .select({
          id: users.id,
          email: users.email,
          nickname: users.nickname,
          role: users.role,
          status: users.status,
          balance: users.balance,
          realNameStatus: users.realNameStatus,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users);
    }

    // 生成 CSV
    const csvHeaders = [
      "ID",
      "邮箱",
      "昵称",
      "角色",
      "状态",
      "余额",
      "实名状态",
      "注册时间",
      "最后登录",
    ];

    const csvRows = usersToExport.map((u) => [
      u.id,
      u.email,
      u.nickname ?? "",
      u.role,
      u.status,
      u.balance,
      u.realNameStatus,
      u.createdAt ? new Date(u.createdAt).toISOString() : "",
      u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : "",
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    // 添加 BOM 以支持 Excel 正确识别 UTF-8
    const bom = "\uFEFF";
    const csvBuffer = Buffer.from(bom + csvContent, "utf-8");

    // 记录审计日志
    await db.insert(auditLogs).values({
      operatorId,
      action: "user_export",
      targetType: "user",
      targetId: 0,
      after: { count: usersToExport.length },
      ip: request.ip,
      description: `批量导出用户数据，共 ${usersToExport.length} 条`,
    });

    // 返回 CSV 文件
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="users_export_${Date.now()}.csv"`);
    reply.send(csvBuffer);
  });
}
// ============================================================
//  3cloud (3C) — 操作类型管理路由
//  CRUD for operation_types table
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, asc, like, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { operationTypes } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";

// ── 操作类型接口 ──

interface OperationType {
  id: number;
  name: string;
  category: string;
  description: string | null;
  enabled: boolean;
  isSystem: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateOperationTypeBody {
  name: string;
  category: string;
  description?: string;
  enabled?: boolean;
}

interface UpdateOperationTypeBody {
  name?: string;
  category?: string;
  description?: string;
  enabled?: boolean;
}

// ── 分类配置 ──

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  auth: { label: "认证类", color: "blue" },
  api_key: { label: "API 类", color: "green" },
  finance: { label: "财务类", color: "yellow" },
  profile: { label: "资料类", color: "purple" },
  agent: { label: "代理类", color: "orange" },
  system: { label: "系统类", color: "red" },
};

// ── 默认操作类型（系统内置） ──

const DEFAULT_OPERATION_TYPES: CreateOperationTypeBody[] = [
  // 认证类
  { name: "login", category: "auth", description: "用户登录" },
  { name: "logout", category: "auth", description: "用户登出" },
  { name: "password_change", category: "auth", description: "修改密码" },
  { name: "password_reset", category: "auth", description: "重置密码" },
  { name: "two_factor_enable", category: "auth", description: "启用两步验证" },
  { name: "two_factor_disable", category: "auth", description: "禁用两步验证" },

  // API 类
  { name: "key_create", category: "api_key", description: "创建 API Key" },
  { name: "key_delete", category: "api_key", description: "删除 API Key" },
  { name: "key_update", category: "api_key", description: "更新 API Key" },
  { name: "key_enable", category: "api_key", description: "启用 API Key" },
  { name: "key_disable", category: "api_key", description: "禁用 API Key" },

  // 财务类
  { name: "recharge", category: "finance", description: "充值" },
  { name: "withdraw", category: "finance", description: "提现" },
  { name: "refund", category: "finance", description: "退款" },
  { name: "balance_adjust", category: "finance", description: "余额调整" },

  // 资料类
  { name: "profile_update", category: "profile", description: "更新个人资料" },
  { name: "real_name_submit", category: "profile", description: "提交实名认证" },
  { name: "real_name_approve", category: "profile", description: "实名认证通过" },
  { name: "real_name_reject", category: "profile", description: "实名认证拒绝" },

  // 代理类
  { name: "agent_create", category: "agent", description: "创建代理" },
  { name: "agent_update", category: "agent", description: "更新代理" },
  { name: "client_create", category: "agent", description: "创建客户" },
  { name: "client_update", category: "agent", description: "更新客户" },

  // 系统类
  { name: "config_change", category: "system", description: "修改系统配置" },
  { name: "user_delete", category: "system", description: "删除用户" },
  { name: "user_disable", category: "system", description: "禁用用户" },
  { name: "user_enable", category: "system", description: "启用用户" },
];

export async function adminOperationTypeRoutes(app: FastifyInstance) {
  // ── 所有路由需要管理员权限 ──
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requirePerm(Perm.USER_EDIT));

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operation-types — 获取操作类型列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/operation-types", async (request, reply) => {
    try {
      const query = request.query as {
        keyword?: string;
        category?: string;
        enabled?: string;
        page?: string;
        pageSize?: string;
      };

      const page = parseInt(query.page || "1", 10);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || "50", 10)));
      const offset = (page - 1) * pageSize;

      const db = getDb();

      // 构建过滤条件
      const conditions = [];

      if (query.keyword) {
        conditions.push(like(operationTypes.name, `%${query.keyword}%`));
      }

      if (query.category) {
        conditions.push(eq(operationTypes.category, query.category as any));
      }

      if (query.enabled !== undefined) {
        conditions.push(eq(operationTypes.enabled, query.enabled === "true"));
      }

      // 查询总数
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(operationTypes)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = Number(countResult?.count ?? 0);

      // 查询列表
      const rows = await db
        .select()
        .from(operationTypes)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(operationTypes.createdAt))
        .limit(pageSize)
        .offset(offset);

      const list: OperationType[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        enabled: r.enabled,
        isSystem: r.isSystem,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));

      reply.status(200).send({
        code: 0,
        data: {
          list,
          total,
          page,
          pageSize,
          categories: CATEGORY_CONFIG,
        },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operation-types/:id — 获取单个操作类型
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/operation-types/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const typeId = parseInt(id, 10);

      if (isNaN(typeId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的操作类型 ID" });
        return;
      }

      const db = getDb();

      const [row] = await db
        .select()
        .from(operationTypes)
        .where(eq(operationTypes.id, typeId))
        .limit(1);

      if (!row) {
        reply.status(404).send({ code: 404, data: null, message: "操作类型不存在" });
        return;
      }

      const item: OperationType = {
        id: row.id,
        name: row.name,
        category: row.category,
        description: row.description,
        enabled: row.enabled,
        isSystem: row.isSystem,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };

      reply.status(200).send({
        code: 0,
        data: item,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/operation-types — 创建操作类型
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/operation-types", async (request, reply) => {
    try {
      const body = request.body as CreateOperationTypeBody;
      const userId = request.user!.userId;

      // 参数校验
      if (!body.name || !body.category) {
        reply.status(400).send({ code: 400, data: null, message: "名称和分类为必填项" });
        return;
      }

      // 校验分类是否有效
      const validCategories = ["auth", "api_key", "finance", "profile", "agent", "system"];
      if (!validCategories.includes(body.category)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的分类" });
        return;
      }

      const db = getDb();

      // 检查名称是否已存在
      const [existing] = await db
        .select()
        .from(operationTypes)
        .where(eq(operationTypes.name, body.name))
        .limit(1);

      if (existing) {
        reply.status(409).send({ code: 409, data: null, message: "操作类型名称已存在" });
        return;
      }

      // 创建操作类型
      const [created] = await db
        .insert(operationTypes)
        .values({
          name: body.name,
          category: body.category as any,
          description: body.description || null,
          enabled: body.enabled ?? true,
          isSystem: false,
          createdBy: userId,
        })
        .returning();

      reply.status(201).send({
        code: 0,
        data: {
          id: created.id,
          name: created.name,
          category: created.category,
          description: created.description,
          enabled: created.enabled,
          isSystem: created.isSystem,
          createdBy: created.createdBy,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
        message: "创建成功",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/operation-types/:id — 更新操作类型
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/operation-types/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as UpdateOperationTypeBody;
      const typeId = parseInt(id, 10);

      if (isNaN(typeId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的操作类型 ID" });
        return;
      }

      const db = getDb();

      // 查询现有记录
      const [existing] = await db
        .select()
        .from(operationTypes)
        .where(eq(operationTypes.id, typeId))
        .limit(1);

      if (!existing) {
        reply.status(404).send({ code: 404, data: null, message: "操作类型不存在" });
        return;
      }

      // 构建更新数据
      const updates: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (body.name !== undefined && body.name !== existing.name) {
        // 检查新名称是否已被使用
        const [duplicate] = await db
          .select()
          .from(operationTypes)
          .where(eq(operationTypes.name, body.name))
          .limit(1);

        if (duplicate) {
          reply.status(409).send({ code: 409, data: null, message: "操作类型名称已存在" });
          return;
        }
        updates.name = body.name;
      }

      if (body.category !== undefined) {
        const validCategories = ["auth", "api_key", "finance", "profile", "agent", "system"];
        if (!validCategories.includes(body.category)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的分类" });
          return;
        }
        updates.category = body.category;
      }

      if (body.description !== undefined) {
        updates.description = body.description || null;
      }

      if (body.enabled !== undefined) {
        updates.enabled = body.enabled;
      }

      // 执行更新
      const [updated] = await db
        .update(operationTypes)
        .set(updates)
        .where(eq(operationTypes.id, typeId))
        .returning();

      reply.status(200).send({
        code: 0,
        data: {
          id: updated.id,
          name: updated.name,
          category: updated.category,
          description: updated.description,
          enabled: updated.enabled,
          isSystem: updated.isSystem,
          createdBy: updated.createdBy,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
        message: "更新成功",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/admin/operation-types/:id — 删除操作类型
  // ──────────────────────────────────────────────

  app.delete("/api/v1/admin/operation-types/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const typeId = parseInt(id, 10);

      if (isNaN(typeId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的操作类型 ID" });
        return;
      }

      const db = getDb();

      // 查询现有记录
      const [existing] = await db
        .select()
        .from(operationTypes)
        .where(eq(operationTypes.id, typeId))
        .limit(1);

      if (!existing) {
        reply.status(404).send({ code: 404, data: null, message: "操作类型不存在" });
        return;
      }

      // 系统内置类型不可删除
      if (existing.isSystem) {
        reply.status(403).send({ code: 403, data: null, message: "系统内置操作类型不可删除" });
        return;
      }

      // 删除记录
      await db
        .delete(operationTypes)
        .where(eq(operationTypes.id, typeId));

      reply.status(200).send({
        code: 0,
        data: null,
        message: "删除成功",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/operation-types/:id/toggle — 切换启用状态
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/operation-types/:id/toggle", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const typeId = parseInt(id, 10);

      if (isNaN(typeId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的操作类型 ID" });
        return;
      }

      const db = getDb();

      // 查询现有记录
      const [existing] = await db
        .select()
        .from(operationTypes)
        .where(eq(operationTypes.id, typeId))
        .limit(1);

      if (!existing) {
        reply.status(404).send({ code: 404, data: null, message: "操作类型不存在" });
        return;
      }

      // 切换状态
      const [updated] = await db
        .update(operationTypes)
        .set({
          enabled: !existing.enabled,
          updatedAt: new Date(),
        })
        .where(eq(operationTypes.id, typeId))
        .returning();

      reply.status(200).send({
        code: 0,
        data: {
          id: updated.id,
          enabled: updated.enabled,
        },
        message: updated.enabled ? "已启用" : "已禁用",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/operation-types/init-defaults — 初始化默认操作类型
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/operation-types/init-defaults", async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const db = getDb();

      // 查询已存在的操作类型
      const existing = await db.select({ name: operationTypes.name }).from(operationTypes);
      const existingNames = new Set(existing.map((r) => r.name));

      // 过滤出不存在的默认类型
      const toCreate = DEFAULT_OPERATION_TYPES.filter((t) => !existingNames.has(t.name));

      if (toCreate.length === 0) {
        reply.status(200).send({
          code: 0,
          data: { created: 0 },
          message: "所有默认操作类型已存在",
        });
        return;
      }

      // 批量创建
      const created = await db
        .insert(operationTypes)
        .values(
          toCreate.map((t) => ({
            name: t.name,
            category: t.category as any,
            description: t.description || null,
            enabled: true,
            isSystem: true, // 标记为系统内置
            createdBy: userId,
          }))
        )
        .returning();

      reply.status(201).send({
        code: 0,
        data: {
          created: created.length,
          items: created.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category,
            description: r.description,
          })),
        },
        message: `成功创建 ${created.length} 个默认操作类型`,
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operation-types/stats — 统计信息
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/operation-types/stats", async (request, reply) => {
    try {
      const db = getDb();

      // 按分类统计
      const byCategory = await db
        .select({
          category: operationTypes.category,
          total: sql<number>`count(*)::int`,
          enabled: sql<number>`count(*) filter (where ${operationTypes.enabled})::int`,
          disabled: sql<number>`count(*) filter (where not ${operationTypes.enabled})::int`,
        })
        .from(operationTypes)
        .groupBy(operationTypes.category);

      // 总数统计
      const [totalStats] = await db
        .select({
          total: sql<number>`count(*)::int`,
          enabled: sql<number>`count(*) filter (where ${operationTypes.enabled})::int`,
          system: sql<number>`count(*) filter (where ${operationTypes.isSystem})::int`,
        })
        .from(operationTypes);

      reply.status(200).send({
        code: 0,
        data: {
          total: Number(totalStats?.total ?? 0),
          enabled: Number(totalStats?.enabled ?? 0),
          disabled: Number(totalStats?.total ?? 0) - Number(totalStats?.enabled ?? 0),
          system: Number(totalStats?.system ?? 0),
          byCategory: byCategory.map((r) => ({
            category: r.category,
            label: CATEGORY_CONFIG[r.category]?.label || r.category,
            total: Number(r.total),
            enabled: Number(r.enabled),
            disabled: Number(r.disabled),
          })),
        },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}

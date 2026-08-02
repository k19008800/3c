import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db/index";
import { users } from "../db/schema/users";
import { accountDeletionRequests } from "../db/schema/account-deletion";
import { runDeletionChecks } from "../services/deletion/checks";

/**
 * 用户端账号注销路由
 * 对齐 docs/sprint-1/01-account-deletion-overview.md §3
 * - 所有接口要求登录（JWT），req.user.sub = userId
 * - 状态流：pending → cooling(7天冷却) → completed / cancelled / rejected
 */

export function meDeletionRoutes(app: FastifyInstance) {
  const requireAuth = async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };

  // ===== 1. 注销前置检查 =====
  // GET /me/deletion/checks — 检查当前用户是否可以注销
  app.get(
    "/me/deletion/checks",
    { onRequest: [requireAuth] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const result = await runDeletionChecks(userId);
      return reply.send({ code: 0, data: result, message: "ok" });
    },
  );

  // ===== 2. 提交注销申请 =====
  // POST /me/deletion/request — 提交注销申请，开始冷却期
  app.post(
    "/me/deletion/request",
    {
      onRequest: [requireAuth],
      schema: {
        body: {
          type: "object",
          required: ["password"],
          properties: {
            password: { type: "string", minLength: 1 },
            reason: { type: "string", maxLength: 1000 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const { password, reason } = req.body as { password: string; reason?: string };

      // 验证密码
      const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u[0]) {
        return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "用户不存在" });
      }
      const valid = await bcrypt.compare(password, u[0].passwordHash);
      if (!valid) {
        return reply.code(403).send({ code: 403, error: "INVALID_PASSWORD", message: "密码验证失败" });
      }

      // 检查是否有待处理的注销申请
      const existing = await db
        .select()
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.userId, userId),
            eq(accountDeletionRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (existing[0]) {
        return reply.code(409).send({ code: 409, error: "DUPLICATE_REQUEST", message: "已有待处理的注销申请" });
      }

      // 前置检查
      const checks = await runDeletionChecks(userId);
      if (!checks.passed) {
        return reply.code(400).send({
          code: 400,
          error: "CHECKS_FAILED",
          message: checks.summary,
          data: { checks: checks.items },
        });
      }

      // 创建申请（冷却期 7 天）
      const coolingDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const created = await db
        .insert(accountDeletionRequests)
        .values({
          userId,
          reason: reason ?? null,
          status: "cooling",
          coolingDeadline,
        })
        .returning();
      const first = created[0];
      if (!first) {
        return reply.code(500).send({ code: 500, error: "INTERNAL", message: "创建注销申请失败" });
      }

      return reply.code(201).send({
        code: 0,
        data: {
          id: first.id,
          status: "cooling",
          coolingDeadline: coolingDeadline.toISOString(),
          message: `注销申请已提交，冷却期至 ${coolingDeadline.toLocaleDateString("zh-CN")}。到期后系统将自动完成注销。`,
        },
        message: "ok",
      });
    },
  );

  // ===== 3. 查询注销申请状态 =====
  // GET /me/deletion/status — 查看当前用户的注销申请
  app.get(
    "/me/deletion/status",
    { onRequest: [requireAuth] },
    async (req) => {
      const userId = Number((req as any).user.sub);
      const rows = await db
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.userId, userId))
        .orderBy(desc(accountDeletionRequests.createdAt))
        .limit(1);

      if (!rows[0]) {
        return { code: 0, data: null, message: "无注销申请记录" };
      }
      return { code: 0, data: rows[0], message: "ok" };
    },
  );

  // ===== 4. 取消注销申请 =====
  // POST /me/deletion/cancel — 冷却期内用户可以取消注销
  app.post(
    "/me/deletion/cancel",
    { onRequest: [requireAuth] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const row = await db
        .select()
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.userId, userId),
            eq(accountDeletionRequests.status, "cooling"),
          ),
        )
        .limit(1);

      if (!row[0]) {
        return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "没有可取消的注销申请（仅冷却期内可取消）" });
      }

      await db
        .update(accountDeletionRequests)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(accountDeletionRequests.id, row[0].id));

      return { code: 0, data: { id: row[0].id, status: "cancelled" }, message: "注销申请已取消" };
    },
  );

  // ===== 5. 立即注销（跳过冷却期，管理员审核通过后直接完成） =====
  // POST /me/deletion/confirm — 冷却期到期后用户主动确认注销
  app.post(
    "/me/deletion/confirm",
    { onRequest: [requireAuth] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const row = await db
        .select()
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.userId, userId),
            eq(accountDeletionRequests.status, "cooling"),
          ),
        )
        .limit(1);

      if (!row[0]) {
        return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "没有可确认的注销申请" });
      }

      // 检查冷却期是否已到
      const deadline = row[0].coolingDeadline;
      if (deadline && new Date() < deadline) {
        return reply.code(400).send({
          code: 400,
          error: "COOLING_NOT_EXPIRED",
          message: `冷却期未到，请在 ${new Date(deadline).toLocaleDateString("zh-CN")} 之后确认`,
        });
      }

      // 标记完成
      const now = new Date();
      const deletionId = row[0].id;
      await db
        .update(accountDeletionRequests)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(accountDeletionRequests.id, deletionId));

      // 软删除用户（设为 deleted 状态）
      await db
        .update(users)
        .set({ status: "deleted", updatedAt: now })
        .where(eq(users.id, userId));

      return { code: 0, data: { id: row[0].id, status: "completed" }, message: "账号注销已完成" };
    },
  );
}

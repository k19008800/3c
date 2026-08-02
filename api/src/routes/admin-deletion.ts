import type { FastifyInstance } from "fastify";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { db } from "../db/index";
import { users } from "../db/schema/users";
import { accountDeletionRequests, deletionChecklist } from "../db/schema/account-deletion";
import { runDeletionChecks } from "../services/deletion/checks";

/**
 * 管理端账号注销审核路由
 * 对齐 docs/sprint-1/01-account-deletion-overview.md §4
 * - 管理员权限校验放在路由入口（允许 admin + super_admin 角色）
 */

function isAdmin(req: any): boolean {
  const role = (req as any).user?.role;
  return role === "admin" || role === "super_admin";
}

export function adminDeletionRoutes(app: FastifyInstance) {
  const requireAuth = async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };

  const requireAdmin = async (req: any, reply: any) => {
    await requireAuth(req, reply);
    if (reply.sent) return;
    if (!isAdmin(req)) {
      return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "仅管理员可操作" });
    }
  };

  // ===== 1. 注销请求列表 =====
  // GET /admin/deletion/requests — 分页查询注销请求，支持状态筛选
  app.get(
    "/admin/deletion/requests",
    { onRequest: [requireAdmin] },
    async (req) => {
      const query = req.query as any;
      const status = query.status as string | undefined;
      const page = Math.max(1, Number(query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
      const offset = (page - 1) * pageSize;

      let where = sql`1=1`;
      if (status) {
        where = sql`${where} AND ${accountDeletionRequests.status} = ${status}`;
      }

      const [totalResult, rows] = await Promise.all([
        db
          .select({ total: count() })
          .from(accountDeletionRequests)
          .where(where),
        db
          .select({
            id: accountDeletionRequests.id,
            userId: accountDeletionRequests.userId,
            userEmail: users.email,
            username: users.username,
            reason: accountDeletionRequests.reason,
            status: accountDeletionRequests.status,
            coolingDeadline: accountDeletionRequests.coolingDeadline,
            cancelledAt: accountDeletionRequests.cancelledAt,
            completedAt: accountDeletionRequests.completedAt,
            rejectedReason: accountDeletionRequests.rejectedReason,
            processedBy: accountDeletionRequests.processedBy,
            createdAt: accountDeletionRequests.createdAt,
          })
          .from(accountDeletionRequests)
          .leftJoin(users, eq(accountDeletionRequests.userId, users.id))
          .where(where)
          .orderBy(desc(accountDeletionRequests.createdAt))
          .limit(pageSize)
          .offset(offset),
      ]);

      return {
        code: 0,
        data: {
          list: rows,
          total: Number(totalResult[0]?.total ?? 0),
          page,
          pageSize,
        },
        message: "ok",
      };
    },
  );

  // ===== 2. 注销请求详情 =====
  // GET /admin/deletion/requests/:id — 查看注销请求详情（含检查清单）
  app.get(
    "/admin/deletion/requests/:id",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const requestId = Number(id);

      const row = await db
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.id, requestId))
        .limit(1);

      if (!row[0]) {
        return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "注销请求不存在" });
      }

      // 查询关联用户
      const u = await db
        .select()
        .from(users)
        .where(eq(users.id, row[0].userId))
        .limit(1);

      // 查询检查清单
      const checklist = await db
        .select()
        .from(deletionChecklist)
        .where(eq(deletionChecklist.requestId, requestId))
        .orderBy(deletionChecklist.checkedAt);

      return {
        code: 0,
        data: {
          request: row[0],
          user: u[0] ? { id: u[0].id, email: u[0].email, username: u[0].username, status: u[0].status, realNameStatus: u[0].realNameStatus, balance: u[0].balance, createdAt: u[0].createdAt } : null,
          checklist,
        },
        message: "ok",
      };
    },
  );

  // ===== 3. 审核驳回 =====
  // POST /admin/deletion/requests/:id/reject — 管理员驳回注销请求
  app.post(
    "/admin/deletion/requests/:id/reject",
    {
      onRequest: [requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["reason"],
          properties: {
            reason: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const requestId = Number(id);
      const { reason } = req.body as { reason: string };
      const adminId = Number((req as any).user.sub);

      const row = await db
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.id, requestId))
        .limit(1);

      if (!row[0]) {
        return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "注销请求不存在" });
      }
      if (row[0].status !== "pending" && row[0].status !== "cooling") {
        return reply.code(400).send({ code: 400, error: "INVALID_STATUS", message: "当前状态不可驳回" });
      }

      await db
        .update(accountDeletionRequests)
        .set({
          status: "rejected",
          rejectedReason: reason,
          processedBy: adminId,
          updatedAt: new Date(),
        })
        .where(eq(accountDeletionRequests.id, requestId));

      return { code: 0, data: { id: requestId, status: "rejected" }, message: "注销请求已驳回" };
    },
  );

  // ===== 4. 立即注销（管理员强制） =====
  // POST /admin/deletion/requests/:id/complete — 管理员强制完成注销
  app.post(
    "/admin/deletion/requests/:id/complete",
    {
      onRequest: [requireAdmin],
      schema: {
        body: {
          type: "object",
          properties: {
            force: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const requestId = Number(id);
      const adminId = Number((req as any).user.sub);
      const body = req.body as any;
      const force = body?.force === true;

      const row = await db
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.id, requestId))
        .limit(1);

      if (!row[0]) {
        return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "注销请求不存在" });
      }
      if (row[0].status === "completed") {
        return reply.code(400).send({ code: 400, error: "ALREADY_COMPLETED", message: "该注销请求已完成" });
      }

      // 非强制模式：执行前置检查
      if (!force) {
        const checks = await runDeletionChecks(row[0].userId);
        if (!checks.passed) {
          return reply.code(400).send({
            code: 400,
            error: "CHECKS_FAILED",
            message: checks.summary,
            data: { checks: checks.items },
          });
        }
      }

      // 完成注销
      const now = new Date();
      await db
        .update(accountDeletionRequests)
        .set({
          status: "completed",
          completedAt: now,
          processedBy: adminId,
          updatedAt: now,
        })
        .where(eq(accountDeletionRequests.id, requestId));

      // 软删除用户
      await db
        .update(users)
        .set({ status: "deleted", updatedAt: now })
        .where(eq(users.id, row[0].userId));

      return {
        code: 0,
        data: { id: requestId, status: "completed", force },
        message: force ? "管理员强制注销完成" : "注销已完成",
      };
    },
  );

  // ===== 5. 注销请求统计 =====
  // GET /admin/deletion/stats — 注销请求统计概览
  app.get(
    "/admin/deletion/stats",
    { onRequest: [requireAdmin] },
    async () => {
      const statuses = ["pending", "cooling", "completed", "cancelled", "rejected"] as const;
      const stats: Record<string, number> = {};

      for (const s of statuses) {
        const r = await db
          .select({ total: count() })
          .from(accountDeletionRequests)
          .where(eq(accountDeletionRequests.status, s));
        stats[s] = Number(r[0]?.total ?? 0);
      }

      // 今日新增
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayNew = await db
        .select({ total: count() })
        .from(accountDeletionRequests)
        .where(sql`${accountDeletionRequests.createdAt} >= ${todayStart}`);
      stats.todayNew = Number(todayNew[0]?.total ?? 0);

      // 冷却期逾期（冷却期已到但未确认完成）
      const overdue = await db
        .select({ total: count() })
        .from(accountDeletionRequests)
        .where(and(
          eq(accountDeletionRequests.status, "cooling"),
          sql`${accountDeletionRequests.coolingDeadline} < NOW()`,
        ));
      stats.overdue = Number(overdue[0]?.total ?? 0);

      return {
        code: 0,
        data: stats,
        message: "ok",
      };
    },
  );
}

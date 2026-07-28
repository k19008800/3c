// ============================================================
//  3cloud (3C) — 管理员账号注销管理
//  GET    /api/v1/admin/deletion                  — 注销请求列表
//  GET    /api/v1/admin/users/:id/deletion         — 查看用户注销详情
//  POST   /api/v1/admin/users/:id/deletion/reject  — 驳回注销
//  POST   /api/v1/admin/users/:id/deletion/force   — 强制注销
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  accountDeletionRequests,
  deletionChecklist,
  users,
} from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/auth.js";

export async function adminDeletionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole(["super_admin", "admin"]));

  // ── 注销请求列表 ──
  app.get("/api/v1/admin/deletion", async (request, reply) => {
    const db = getDb();
    const { status, limit = "20", offset = "0" } = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };

    const where = status
      ? eq(accountDeletionRequests.status, status)
      : undefined;

    const rows = await db
      .select({
        id: accountDeletionRequests.id,
        userId: accountDeletionRequests.userId,
        userEmail: users.email,
        userNickname: users.nickname,
        reason: accountDeletionRequests.reason,
        status: accountDeletionRequests.status,
        coolingDeadline: accountDeletionRequests.coolingDeadline,
        createdAt: accountDeletionRequests.createdAt,
        completedAt: accountDeletionRequests.completedAt,
      })
      .from(accountDeletionRequests)
      .leftJoin(users, eq(accountDeletionRequests.userId, users.id))
      .where(where)
      .orderBy(desc(accountDeletionRequests.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    // 统计各状态数量
    const statsResult = await db.execute(
      sql`SELECT status, COUNT(*) as cnt
          FROM account_deletion_requests
          GROUP BY status`
    );

    const stats: Record<string, number> = {};
    for (const row of statsResult.rows) {
      stats[(row as any).status] = parseInt((row as any).cnt || "0");
    }

    return reply.status(200).send({
      code: 0,
      data: { rows, stats },
    });
  });

  // ── 查看用户注销详情 ──
  app.get("/api/v1/admin/users/:id/deletion", async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id);

    const reqs = await db
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.userId, userId))
      .orderBy(desc(accountDeletionRequests.createdAt))
      .limit(1);

    if (reqs.length === 0) {
      return reply.status(404).send({
        code: 404,
        error: "NO_DELETION_REQUEST",
        message: "该用户无注销记录",
      });
    }

    const checks = await db
      .select()
      .from(deletionChecklist)
      .where(eq(deletionChecklist.requestId, reqs[0].id));

    return reply.status(200).send({
      code: 0,
      data: { ...reqs[0], checks },
    });
  });

  // ── 驳回注销申请 ──
  app.post("/api/v1/admin/users/:id/deletion/reject", async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };
    const adminUserId = request.user!.userId;

    if (!reason) {
      return reply.status(400).send({
        code: 400,
        error: "REJECT_REASON_REQUIRED",
        message: "驳回必须提供原因",
      });
    }

    const userId = parseInt(id);
    const active = await db
      .select()
      .from(accountDeletionRequests)
      .where(
        and(
          eq(accountDeletionRequests.userId, userId),
          sql`${accountDeletionRequests.status} IN ('pending', 'cooling')`
        )
      )
      .limit(1);

    if (active.length === 0) {
      return reply.status(400).send({
        code: 400,
        error: "NO_ACTIVE_DELETION",
        message: "该用户没有活跃的注销申请",
      });
    }

    await db
      .update(accountDeletionRequests)
      .set({
        status: "rejected",
        rejectedReason: reason,
        processedBy: adminUserId,
        updatedAt: sql`NOW()`,
      })
      .where(eq(accountDeletionRequests.id, active[0].id));

    return reply.status(200).send({
      code: 0,
      message: "注销申请已驳回",
    });
  });

  // ── 强制注销 ──
  app.post("/api/v1/admin/users/:id/deletion/force", async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const adminUserId = request.user!.userId;

    const userId = parseInt(id);

    // 创建注销请求（如不存在）
    const existing = await db
      .select({ id: accountDeletionRequests.id })
      .from(accountDeletionRequests)
      .where(
        and(
          eq(accountDeletionRequests.userId, userId),
          sql`${accountDeletionRequests.status} = 'cooling'`
        )
      )
      .limit(1);

    let requestId: number;
    if (existing.length > 0) {
      requestId = existing[0].id;
    } else {
      const created = await db
        .insert(accountDeletionRequests)
        .values({
          userId,
          status: "cooling",
          coolingDeadline: sql`NOW()`,
        })
        .returning();
      requestId = created[0].id;
    }

    // 执行数据脱敏
    await db.execute(
      sql`UPDATE users SET
        status = 'deleted',
        nickname = CONCAT('已注销用户_', id),
        email = CONCAT('deleted_', id, '@internal.3cloud.ai'),
        phone = NULL,
        avatar_url = NULL,
        updated_at = NOW()
      WHERE id = ${userId}`
    );

    // 标记请求完成
    await db
      .update(accountDeletionRequests)
      .set({
        status: "completed",
        completedAt: sql`NOW()`,
        processedBy: adminUserId,
        updatedAt: sql`NOW()`,
      })
      .where(eq(accountDeletionRequests.id, requestId));

    return reply.status(200).send({
      code: 0,
      message: "用户已强制注销",
    });
  });
}

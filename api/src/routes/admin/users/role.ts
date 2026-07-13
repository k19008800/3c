import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  users,
  userRoleHistory,
  auditLogs,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { adminChangeRoleSchema } from "../../../schemas.js";
import type { AdminChangeRoleInput } from "../../../schemas.js";

export async function roleRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/:id/change-role — 变更角色
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/users/:id/change-role", {
    preHandler: [requirePerm(Perm.USER_CHANGE_ROLE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const parsed = adminChangeRoleSchema.parse(request.body);

    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    if (user.role === parsed.role) {
      reply.status(400).send({ code: 400, data: null, message: "角色未变化" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ role: parsed.role })
        .where(eq(users.id, userId));

      await tx.insert(userRoleHistory).values({
        userId,
        oldRole: user.role,
        newRole: parsed.role,
        operatorId,
        reason: parsed.reason,
      });

      await tx.insert(auditLogs).values({
        operatorId,
        action: "role_change",
        targetType: "user",
        targetId: userId,
        before: { role: user.role },
        after: { role: parsed.role },
        ip: request.ip,
        description: `角色变更: ${user.role} → ${parsed.role}${parsed.reason ? ` (${parsed.reason})` : ""}`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "角色变更成功",
    });
  });
}

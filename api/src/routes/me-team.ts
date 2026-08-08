import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, pool } from "../db/index";
import { teamMembers, TEAM_ROLES, TEAM_ROLE_LABELS } from "../db/schema/team-members";
import { users } from "../db/schema/users";

/**
 * 团队/子账号管理（用户端）
 * 对齐 §32.4 团队协作
 */

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };
}

export function meTeamRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const uid = (req: any) => Number((req as any).user.sub);

  // 1. 团队成员列表
  app.get("/me/team/members", { onRequest: [auth] }, async (req) => {
    const ownerId = uid(req);
    const rows = await pool.query(
      `SELECT tm.id, tm.role, tm.status, tm.invited_at, tm.joined_at,
              u.id AS user_id, u.email, u.username
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_owner_id = $1
       ORDER BY tm.invited_at DESC`,
      [ownerId],
    );
    return {
      code: 0,
      data: {
        members: rows.rows.map((r: any) => ({
          ...r,
          role_label: TEAM_ROLE_LABELS[r.role] ?? r.role,
        })),
      },
      message: "ok",
    };
  });

  // 2. 邀请成员
  app.post("/me/team/invite", { onRequest: [auth] }, async (req, reply) => {
    const ownerId = uid(req);
    const b = req.body as {
      email?: string;
      username?: string;
      role?: string;
    };

    if (!b.email?.trim()) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "邮箱必填" });
    const role = b.role ?? "member";
    if (!TEAM_ROLES.includes(role as any)) {
      return reply.code(400).send({ code: 400, error: "INVALID_ROLE", message: `角色必须是: ${TEAM_ROLES.join(", ")}` });
    }

    // 查找用户
    const u = await pool.query("SELECT id FROM users WHERE email = $1", [b.email.trim()]);
    if (!u.rows[0]) return reply.code(404).send({ code: 404, error: "USER_NOT_FOUND", message: "用户不存在" });

    const memberUserId = Number(u.rows[0].id);
    if (memberUserId === ownerId) return reply.code(400).send({ code: 400, error: "SELF_INVITE", message: "不能邀请自己" });

    // 是否已在团队中
    const exist = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamOwnerId, ownerId), eq(teamMembers.userId, memberUserId)))
      .limit(1);
    if (exist[0]) {
      return reply.code(409).send({ code: 409, error: "ALREADY_MEMBER", message: "该用户已在团队中" });
    }

    const created = await db
      .insert(teamMembers)
      .values({
        teamOwnerId: ownerId,
        userId: memberUserId,
        role,
        status: "invited",
      })
      .returning({ id: teamMembers.id });

    return {
      code: 0,
      data: {
        id: created[0]!.id,
        user_id: memberUserId,
        email: b.email.trim(),
        role,
        status: "invited",
      },
      message: "已发送邀请",
    };
  });

  // 3. 修改角色
  app.put("/me/team/members/:id/role", { onRequest: [auth] }, async (req, reply) => {
    const ownerId = uid(req);
    const memberId = Number((req.params as any).id);
    const { role } = req.body as { role?: string };

    if (!role || !TEAM_ROLES.includes(role as any)) {
      return reply.code(400).send({ code: 400, error: "INVALID_ROLE", message: `角色必须是: ${TEAM_ROLES.join(", ")}` });
    }
    if (role === "owner") return reply.code(400).send({ code: 400, error: "BAD_ROLE", message: "不能将成员设为 owner" });

    const r = await db
      .update(teamMembers)
      .set({ role })
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamOwnerId, ownerId)));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "成员不存在" });

    return { code: 0, data: { success: true }, message: "角色已更新" };
  });

  // 4. 移除成员
  app.delete("/me/team/members/:id", { onRequest: [auth] }, async (req, reply) => {
    const ownerId = uid(req);
    const memberId = Number((req.params as any).id);

    const r = await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamOwnerId, ownerId)));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "成员不存在" });

    return { code: 0, data: { success: true }, message: "成员已移除" };
  });
}

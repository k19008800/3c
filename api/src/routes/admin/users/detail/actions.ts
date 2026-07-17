import { eq, and, desc } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { getDb } from "../../../../db/index.js";
import {
  userRoleHistory,
  userOauthBindings,
  auditLogs,
  userNotes,
  userIpWhitelist,
} from "../../../../db/schema.js";
import { requirePerm, Perm } from "../../../../middleware/auth.js";
import {
  adminUnbindOAuthSchema,
  adminAddUserNoteSchema,
  adminIpWhitelistSchema,
} from "../../../../schemas.js";
import { validateUserId } from "./types.js";

export function registerActionsRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/role-history — 角色变更历史
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/role-history", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const rows = await db
      .select()
      .from(userRoleHistory)
      .where(eq(userRoleHistory.userId, userId))
      .orderBy(desc(userRoleHistory.createdAt))
      .limit(50);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/oauth-bindings — OAuth 绑定列表
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/oauth-bindings", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const bindings = await db
      .select({
        id: userOauthBindings.id,
        provider: userOauthBindings.provider,
        providerUserId: userOauthBindings.providerUserId,
        providerEmail: userOauthBindings.providerEmail,
        nickname: userOauthBindings.nickname,
        avatarUrl: userOauthBindings.avatarUrl,
        createdAt: userOauthBindings.createdAt,
      })
      .from(userOauthBindings)
      .where(eq(userOauthBindings.userId, userId))
      .orderBy(desc(userOauthBindings.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: bindings.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/:id/unbind-oauth — 解绑 OAuth
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/users/:id/unbind-oauth", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const operatorId = request.user!.userId;
    const parsed = adminUnbindOAuthSchema.parse(request.body);

    const [binding] = await db
      .select({ id: userOauthBindings.id })
      .from(userOauthBindings)
      .where(and(eq(userOauthBindings.userId, userId), eq(userOauthBindings.provider, parsed.provider)))
      .limit(1);

    if (!binding) {
      reply.status(404).send({ code: 404, data: null, message: `用户未绑定 ${parsed.provider}` });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.delete(userOauthBindings).where(eq(userOauthBindings.id, binding.id));
      await tx.insert(auditLogs).values({
        operatorId,
        action: "user_update",
        targetType: "user",
        targetId: userId,
        ip: request.ip,
        description: `管理员解绑用户第三方账号: ${parsed.provider}`,
      });
    });

    reply.status(200).send({ code: 0, data: null, message: `${parsed.provider} 已解绑` });
  });

  // ──────────────────────────────────────────────
  //  用户备注 (Notes)
  // ──────────────────────────────────────────────

  //  GET /api/v1/admin/users/:id/notes
  app.get("/api/v1/admin/users/:id/notes", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const rows = await db
      .select({
        id: userNotes.id,
        content: userNotes.content,
        createdBy: userNotes.createdBy,
        createdAt: userNotes.createdAt,
        updatedAt: userNotes.updatedAt,
      })
      .from(userNotes)
      .where(eq(userNotes.userId, userId))
      .orderBy(desc(userNotes.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      message: "ok",
    });
  });

  //  POST /api/v1/admin/users/:id/notes
  app.post("/api/v1/admin/users/:id/notes", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const parsed = adminAddUserNoteSchema.parse(request.body);

    const [note] = await db
      .insert(userNotes)
      .values({
        userId,
        content: parsed.content,
        createdBy: request.user!.userId,
      })
      .returning({ id: userNotes.id });

    reply.status(200).send({
      code: 0,
      data: { id: note.id },
      message: "备注已添加",
    });
  });

  //  DELETE /api/v1/admin/users/:id/notes/:noteId
  app.delete("/api/v1/admin/users/:id/notes/:noteId", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id, noteId } = request.params as { id: string; noteId: string };
    const userId = parseInt(id, 10);
    const parsedNoteId = parseInt(noteId, 10);

    if (isNaN(userId) || isNaN(parsedNoteId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
      return;
    }

    const [note] = await db
      .select({ id: userNotes.id })
      .from(userNotes)
      .where(and(eq(userNotes.id, parsedNoteId), eq(userNotes.userId, userId)))
      .limit(1);

    if (!note) {
      reply.status(404).send({ code: 404, data: null, message: "备注不存在" });
      return;
    }

    await db.delete(userNotes).where(eq(userNotes.id, parsedNoteId));
    reply.status(200).send({ code: 0, data: null, message: "备注已删除" });
  });

  // ──────────────────────────────────────────────
  //  IP 白名单管理
  // ──────────────────────────────────────────────

  //  GET /api/v1/admin/users/:id/ip-whitelist
  app.get("/api/v1/admin/users/:id/ip-whitelist", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const list = await db
      .select()
      .from(userIpWhitelist)
      .where(and(eq(userIpWhitelist.userId, userId), eq(userIpWhitelist.enabled, true)))
      .orderBy(desc(userIpWhitelist.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: list.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      message: "ok",
    });
  });

  //  POST /api/v1/admin/users/:id/ip-whitelist
  app.post("/api/v1/admin/users/:id/ip-whitelist", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const parsed = adminIpWhitelistSchema.parse(request.body);

    const existing = await db
      .select({ id: userIpWhitelist.id })
      .from(userIpWhitelist)
      .where(and(eq(userIpWhitelist.userId, userId), eq(userIpWhitelist.ip, parsed.ip)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userIpWhitelist)
        .set({ enabled: true, description: parsed.description ?? null, updatedAt: new Date() })
        .where(eq(userIpWhitelist.id, existing[0].id));

      reply.status(200).send({ code: 0, data: null, message: "IP 白名单已更新" });
      return;
    }

    await db.insert(userIpWhitelist).values({
      userId,
      ip: parsed.ip,
      description: parsed.description ?? null,
    });

    reply.status(200).send({ code: 0, data: null, message: "IP 已加入白名单" });
  });

  //  DELETE /api/v1/admin/users/:id/ip-whitelist/:whitelistId
  app.delete("/api/v1/admin/users/:id/ip-whitelist/:whitelistId", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id, whitelistId } = request.params as { id: string; whitelistId: string };
    const userId = parseInt(id, 10);
    const parsedId = parseInt(whitelistId, 10);

    if (isNaN(userId) || isNaN(parsedId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
      return;
    }

    const [entry] = await db
      .select({ id: userIpWhitelist.id })
      .from(userIpWhitelist)
      .where(and(eq(userIpWhitelist.id, parsedId), eq(userIpWhitelist.userId, userId)))
      .limit(1);

    if (!entry) {
      reply.status(404).send({ code: 404, data: null, message: "白名单条目不存在" });
      return;
    }

    await db
      .update(userIpWhitelist)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(userIpWhitelist.id, parsedId));

    reply.status(200).send({ code: 0, data: null, message: "IP 已从白名单移除" });
  });
}

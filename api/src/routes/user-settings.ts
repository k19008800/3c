// ============================================================
//  3cloud (3C) — 用户设置路由
//  GET    /api/v1/me/settings   — 获取用户设置（含主题）
//  PATCH  /api/v1/me/settings   — 更新用户设置
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { authenticateJWT } from "../middleware/auth.js";
import { logOperation } from "../services/operation-log.js";

// 主题类型
type Theme = "light" | "dark" | "system";
const VALID_THEMES: Theme[] = ["light", "dark", "system"];

export async function userSettingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/settings — 获取用户设置
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/settings", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;

    const [user] = await db
      .select({
        theme: users.theme,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: {
        theme: user.theme || "system",
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/me/settings — 更新用户设置
  // ──────────────────────────────────────────────

  app.patch("/api/v1/me/settings", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const body = request.body as { theme?: string };

    // 验证主题值
    if (body.theme !== undefined && !VALID_THEMES.includes(body.theme as Theme)) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: `无效的主题值，支持: ${VALID_THEMES.join(", ")}`,
      });
      return;
    }

    // 构建更新对象
    const updates: Record<string, any> = {};
    if (body.theme !== undefined) {
      updates.theme = body.theme;
    }

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有需要更新的字段" });
      return;
    }

    // 执行更新
    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId));

    // 记录操作日志
    logOperation({
      userId,
      userRole: request.user!.role,
      category: "settings",
      action: "update_settings",
      summary: `更新用户设置: ${JSON.stringify(updates)}`,
      ip: request.ip,
      userAgent: request.headers["user-agent"] as string | undefined,
    });

    reply.status(200).send({
      code: 0,
      data: updates,
      message: "设置已更新",
    });
  });
}

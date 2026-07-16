// ============================================================
//  3cloud (3C) — Quick Connect Route
//  POST /api/v1/user/debug-token  — 生成临时调试令牌
//  GET  /api/v1/user/quick-connect — 获取接入信息
// ============================================================

import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { authenticateJWT } from "../middleware/auth.js";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { models } from "../db/schema.js";

export async function quickConnectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 生成调试令牌 ──
  app.post("/api/v1/user/debug-token", async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as any;
    const minutes = Math.min(
      Math.max(1, body?.minutes ?? 30),
      1440, // 最长 24 小时
    );

    const token = jwt.sign(
      { userId, role: "debug", scope: "debug" },
      config.jwt.accessSecret,
      { expiresIn: `${minutes}m` },
    );

    return {
      code: 0,
      data: {
        token,
        expiresIn: minutes * 60,
        playgroundUrl: `/admin/playground?token=${token}`,
      },
      message: "ok",
    };
  });

  // ── 获取接入信息 ──
  app.get("/api/v1/user/quick-connect", async (request, reply) => {
    const db = getDb();

    // 获取一个可用模型作为默认模型
    const [defaultModel] = await db
      .select({ name: models.name })
      .from(models)
      .where(eq(models.status, true))
      .limit(1);

    return {
      code: 0,
      data: {
        baseUrl: `${request.protocol}://${request.hostname}`,
        defaultModel: defaultModel?.name ?? "deepseek-chat",
        endpoint: "/v1/chat/completions",
      },
      message: "ok",
    };
  });
}

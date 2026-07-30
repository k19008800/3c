// ============================================================
//  3cloud (3C) — 微信扫码登录配置管理
//  配置存储于 system_configs 表，key: scm_wechat_login_config
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

const WECHAT_CONFIG_KEY = "scm_wechat_login_config";

export async function adminWechatLoginRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  const db = getDb();

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/settings/wechat-login — 获取微信登录配置
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/settings/wechat-login", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const row = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, WECHAT_CONFIG_KEY))
      .limit(1);

    if (row.length === 0) {
      return reply.status(200).send({
        code: 0,
        data: {
          enabled: false,
          appId: "",
          appSecret: "",
          redirectUri: "",
          description: "",
        },
        message: "ok",
      });
    }

    reply.status(200).send({
      code: 0,
      data: JSON.parse(row[0].value),
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/v1/admin/settings/wechat-login — 更新微信登录配置
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/settings/wechat-login", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const body = request.body as {
      enabled: boolean
      appId: string
      appSecret: string
      redirectUri: string
      description: string
    };

    if (!body.appId && body.enabled) {
      return reply.status(400).send({ code: 400, message: "启用微信登录时必须填写 AppID" });
    }

    const value = JSON.stringify(body);

    const existing = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, WECHAT_CONFIG_KEY))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(systemConfigs).values({
        key: WECHAT_CONFIG_KEY,
        value,
        description: "微信扫码登录配置",
      });
    } else {
      await db
        .update(systemConfigs)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemConfigs.key, WECHAT_CONFIG_KEY));
    }

    reply.status(200).send({ code: 0, data: body, message: "微信登录配置已保存" });
  });
}
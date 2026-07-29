// ============================================================
//  3cloud (3C) — 企业通讯录扫码登录配置（§32.3）
//  企业微信/钉钉/飞书应用配置管理
//  配置存储于 system_configs 表
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";

interface CorpAppConfig {
  enabled: boolean
  appId: string        // 企业微信: CorpID, 钉钉: AppKey, 飞书: AppID
  agentId: string      // 企业微信: AgentId, 钉钉: AgentId, 飞书: (空)
  appSecret: string    // 企业微信: CorpSecret, 钉钉: AppSecret, 飞书: AppSecret
  redirectUri: string
  description: string
}

const PROVIDER_KEYS: Record<string, string> = {
  wecom: "scm_provider_config_wecom",
  dingtalk: "scm_provider_config_dingtalk",
  feishu: "scm_provider_config_feishu",
};

export async function adminCorpLoginRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  const db = getDb();

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/settings/corp-login/:provider — 获取配置
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/settings/corp-login/:provider", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const { provider } = request.params as { provider: string };

    if (!PROVIDER_KEYS[provider]) {
      return reply.status(400).send({ code: 400, message: `不支持的提供商: ${provider}` });
    }

    const row = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, PROVIDER_KEYS[provider]))
      .limit(1);

    if (row.length === 0) {
      return reply.status(200).send({
        code: 0,
        data: {
          provider,
          enabled: false,
          appId: "",
          agentId: "",
          appSecret: "",
          redirectUri: "",
          description: "",
        },
        message: "ok",
      });
    }

    reply.status(200).send({
      code: 0,
      data: { provider, ...JSON.parse(row[0].value) },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/v1/admin/settings/corp-login/:provider — 更新配置
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/settings/corp-login/:provider", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const { provider } = request.params as { provider: string };

    if (!PROVIDER_KEYS[provider]) {
      return reply.status(400).send({ code: 400, message: `不支持的提供商: ${provider}` });
    }

    const body = request.body as CorpAppConfig;
    const dbKey = PROVIDER_KEYS[provider];
    const value = JSON.stringify(body);

    const existing = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, dbKey))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(systemConfigs).values({
        key: dbKey,
        value,
        description: `企业通讯录登录: ${provider}`,
      });
    } else {
      await db
        .update(systemConfigs)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemConfigs.key, dbKey));
    }

    reply.status(200).send({ code: 0, data: { provider, ...body }, message: "配置已保存" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/settings/corp-login — 获取所有提供商配置列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/settings/corp-login", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const keys = Object.values(PROVIDER_KEYS);

    const rows = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, keys[0])); // Drizzle IN clause workaround

    // 查每个
    const configs: Record<string, any> = {};
    for (const [provider, key] of Object.entries(PROVIDER_KEYS)) {
      const row = await db
        .select()
        .from(systemConfigs)
        .where(eq(systemConfigs.key, key))
        .limit(1);

      if (row.length > 0) {
        configs[provider] = { provider, ...JSON.parse(row[0].value) };
      } else {
        configs[provider] = { provider, enabled: false, appId: "", agentId: "", appSecret: "", redirectUri: "", description: "" };
      }
    }

    reply.status(200).send({ code: 0, data: { configs }, message: "ok" });
  });
}

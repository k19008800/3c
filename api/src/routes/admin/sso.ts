// ============================================================
//  3cloud (3C) — SSO 单点登录配置（§32.2）
//  通过 system_configs 表存储 OIDC/SAML/LDAP 配置
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";

const SSO_CONFIG_KEY = "sso_config";

// ── 路由 ──

export async function adminSSORoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  const db = getDb();

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/settings/sso — 获取 SSO 配置
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/settings/sso", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const row = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, SSO_CONFIG_KEY))
      .limit(1);

    if (row.length === 0) {
      return reply.status(200).send({
        code: 0,
        data: {
          enabled: false,
          provider: "oidc",
          config: {
            clientId: "",
            clientSecret: "",
            issuerUrl: "",
            authorizationUrl: "",
            tokenUrl: "",
            userInfoUrl: "",
            logoutUrl: "",
            scopes: "openid profile email",
            groupMapping: {},
            autoCreateUser: true,
            defaultRole: "user",
          },
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
  //  PUT /api/v1/admin/settings/sso — 更新 SSO 配置
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/settings/sso", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const body = request.body as {
      enabled: boolean;
      provider: "oidc" | "saml" | "ldap";
      config: {
        clientId: string;
        clientSecret: string;
        issuerUrl: string;
        authorizationUrl: string;
        tokenUrl: string;
        userInfoUrl: string;
        logoutUrl: string;
        scopes: string;
        groupMapping: Record<string, string>;
        autoCreateUser: boolean;
        defaultRole: string;
        ldapUrl?: string;
        ldapBindDn?: string;
        ldapBindPassword?: string;
        ldapBaseDn?: string;
        ldapFilter?: string;
        idpMetadataUrl?: string;
      };
    };

    if (!body.provider || !body.config) {
      return reply.status(400).send({ code: 400, message: "缺少必填参数" });
    }

    const value = JSON.stringify(body);

    const existing = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, SSO_CONFIG_KEY))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(systemConfigs).values({
        key: SSO_CONFIG_KEY,
        value,
        description: "SSO 单点登录配置（OIDC/SAML/LDAP）",
      });
    } else {
      await db
        .update(systemConfigs)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemConfigs.key, SSO_CONFIG_KEY));
    }

    reply.status(200).send({ code: 0, data: body, message: "SSO 配置已保存" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/settings/sso/test — 测试 SSO 连接
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/settings/sso/test", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const { provider, config } = request.body as {
      provider: string;
      config: { issuerUrl?: string; authorizationUrl?: string; ldapUrl?: string };
    };

    let result: { status: string; latency: number; message?: string } = {
      status: "failed",
      latency: 0,
    };

    if (provider === "oidc" || provider === "saml") {
      const url = config.issuerUrl || config.authorizationUrl;
      if (!url) {
        return reply.status(200).send({ code: 0, data: { status: "skipped", latency: 0, message: "未提供测试 URL" } });
      }
      try {
        const start = Date.now();
        const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        result = {
          status: res.ok ? "success" : "failed",
          latency: Date.now() - start,
          message: res.ok ? "连接成功" : `HTTP ${res.status}`,
        };
      } catch (e: any) {
        result.message = `连接异常: ${e.message}`;
      }
    } else if (provider === "ldap") {
      result = { status: "skipped", latency: 0, message: "LDAP 连接测试需在部署环境执行" };
    }

    reply.status(200).send({ code: 0, data: result, message: "ok" });
  });
}

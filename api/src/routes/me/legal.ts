// ============================================================
//  3cloud (3C) — 用户端法律文档同意/状态路由（需认证）
//  GET  /api/v1/me/privacy-policy/status     — 隐私政策状态
//  POST /api/v1/me/privacy-policy/consent    — 同意隐私政策
//  GET  /api/v1/me/terms-of-service/status   — 服务条款状态
//  POST /api/v1/me/terms-of-service/consent  — 同意服务条款
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { privacyPolicyVersions, userPrivacyConsents, termsOfServiceVersions, userTosConsents } from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";

export async function meLegalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 获取请求 IP ──
  function getClientIp(request: any): string {
    return request.headers["x-forwarded-for"] || request.ip || "";
  }

  // ── 隐私政策状态 ──
  // GET /api/v1/me/privacy-policy/status
  app.get("/api/v1/me/privacy-policy/status", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;

    // 获取最新已发布的版本
    const [latestVersion] = await db
      .select({
        id: privacyPolicyVersions.id,
        version: privacyPolicyVersions.version,
        title: privacyPolicyVersions.title,
        summary: privacyPolicyVersions.summary,
        publishedAt: privacyPolicyVersions.publishedAt,
      })
      .from(privacyPolicyVersions)
      .where(eq(privacyPolicyVersions.status, "published"))
      .orderBy(desc(privacyPolicyVersions.publishedAt))
      .limit(1);

    if (!latestVersion) {
      reply.status(200).send({
        code: 0,
        data: {
          needConsent: false,
          latestVersion: null,
          consentedVersionId: null,
        },
        message: "ok",
      });
      return;
    }

    // 查询用户是否已同意该版本
    const [consent] = await db
      .select({
        id: userPrivacyConsents.id,
        versionId: userPrivacyConsents.versionId,
        consentedAt: userPrivacyConsents.consentedAt,
      })
      .from(userPrivacyConsents)
      .where(
        and(
          eq(userPrivacyConsents.userId, userId),
          eq(userPrivacyConsents.versionId, latestVersion.id)
        )
      )
      .limit(1);

    reply.status(200).send({
      code: 0,
      data: {
        needConsent: !consent,
        latestVersion,
        consentedVersionId: consent?.versionId ?? null,
      },
      message: "ok",
    });
  });

  // ── 同意隐私政策 ──
  // POST /api/v1/me/privacy-policy/consent
  app.post("/api/v1/me/privacy-policy/consent", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const ip = getClientIp(request);

    // 获取最新已发布的版本
    const [latestVersion] = await db
      .select({ id: privacyPolicyVersions.id })
      .from(privacyPolicyVersions)
      .where(eq(privacyPolicyVersions.status, "published"))
      .orderBy(desc(privacyPolicyVersions.publishedAt))
      .limit(1);

    if (!latestVersion) {
      reply.status(400).send({ code: 400, data: null, message: "暂无已发布的隐私政策，无法同意" });
      return;
    }

    // 检查是否已同意
    const [existing] = await db
      .select({ id: userPrivacyConsents.id })
      .from(userPrivacyConsents)
      .where(
        and(
          eq(userPrivacyConsents.userId, userId),
          eq(userPrivacyConsents.versionId, latestVersion.id)
        )
      )
      .limit(1);

    if (existing) {
      reply.status(200).send({ code: 0, data: { alreadyConsented: true }, message: "您已同意该版本的隐私政策" });
      return;
    }

    const [consent] = await db
      .insert(userPrivacyConsents)
      .values({
        userId,
        versionId: latestVersion.id,
        ip,
      })
      .returning();

    reply.status(200).send({
      code: 0,
      data: {
        id: consent.id,
        versionId: consent.versionId,
        consentedAt: consent.consentedAt,
        alreadyConsented: false,
      },
      message: "ok",
    });
  });

  // ── 服务条款状态 ──
  // GET /api/v1/me/terms-of-service/status
  app.get("/api/v1/me/terms-of-service/status", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;

    // 获取最新已发布的版本
    const [latestVersion] = await db
      .select({
        id: termsOfServiceVersions.id,
        version: termsOfServiceVersions.version,
        title: termsOfServiceVersions.title,
        summary: termsOfServiceVersions.summary,
        publishedAt: termsOfServiceVersions.publishedAt,
      })
      .from(termsOfServiceVersions)
      .where(eq(termsOfServiceVersions.status, "published"))
      .orderBy(desc(termsOfServiceVersions.publishedAt))
      .limit(1);

    if (!latestVersion) {
      reply.status(200).send({
        code: 0,
        data: {
          needConsent: false,
          latestVersion: null,
          consentedVersionId: null,
        },
        message: "ok",
      });
      return;
    }

    // 查询用户是否已同意该版本
    const [consent] = await db
      .select({
        id: userTosConsents.id,
        versionId: userTosConsents.versionId,
        consentedAt: userTosConsents.consentedAt,
      })
      .from(userTosConsents)
      .where(
        and(
          eq(userTosConsents.userId, userId),
          eq(userTosConsents.versionId, latestVersion.id)
        )
      )
      .limit(1);

    reply.status(200).send({
      code: 0,
      data: {
        needConsent: !consent,
        latestVersion,
        consentedVersionId: consent?.versionId ?? null,
      },
      message: "ok",
    });
  });

  // ── 同意服务条款 ──
  // POST /api/v1/me/terms-of-service/consent
  app.post("/api/v1/me/terms-of-service/consent", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const ip = getClientIp(request);

    // 获取最新已发布的版本
    const [latestVersion] = await db
      .select({ id: termsOfServiceVersions.id })
      .from(termsOfServiceVersions)
      .where(eq(termsOfServiceVersions.status, "published"))
      .orderBy(desc(termsOfServiceVersions.publishedAt))
      .limit(1);

    if (!latestVersion) {
      reply.status(400).send({ code: 400, data: null, message: "暂无已发布的服务条款，无法同意" });
      return;
    }

    // 检查是否已同意
    const [existing] = await db
      .select({ id: userTosConsents.id })
      .from(userTosConsents)
      .where(
        and(
          eq(userTosConsents.userId, userId),
          eq(userTosConsents.versionId, latestVersion.id)
        )
      )
      .limit(1);

    if (existing) {
      reply.status(200).send({ code: 0, data: { alreadyConsented: true }, message: "您已同意该版本的服务条款" });
      return;
    }

    const [consent] = await db
      .insert(userTosConsents)
      .values({
        userId,
        versionId: latestVersion.id,
        ip,
      })
      .returning();

    reply.status(200).send({
      code: 0,
      data: {
        id: consent.id,
        versionId: consent.versionId,
        consentedAt: consent.consentedAt,
        alreadyConsented: false,
      },
      message: "ok",
    });
  });
}
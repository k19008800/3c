// ============================================================
//  3cloud (3C) — 公开法律文档路由（无需认证）
//  GET /api/v1/public/privacy-policy/current    — 当前已发布的隐私政策
//  GET /api/v1/public/terms-of-service/current  — 当前已发布的服务条款
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { privacyPolicyVersions, termsOfServiceVersions } from "../../db/schema.js";

export async function publicLegalRoutes(app: FastifyInstance) {
  // ── 当前已发布的隐私政策 ──
  app.get("/api/v1/public/privacy-policy/current", async (_request, reply) => {
    const db = getDb();

    const [version] = await db
      .select({
        id: privacyPolicyVersions.id,
        version: privacyPolicyVersions.version,
        title: privacyPolicyVersions.title,
        content: privacyPolicyVersions.content,
        summary: privacyPolicyVersions.summary,
        publishedAt: privacyPolicyVersions.publishedAt,
      })
      .from(privacyPolicyVersions)
      .where(eq(privacyPolicyVersions.status, "published"))
      .orderBy(desc(privacyPolicyVersions.publishedAt))
      .limit(1);

    if (!version) {
      reply.status(404).send({ code: 404, data: null, message: "暂无已发布的隐私政策" });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: version,
      message: "ok",
    });
  });

  // ── 当前已发布的服务条款 ──
  app.get("/api/v1/public/terms-of-service/current", async (_request, reply) => {
    const db = getDb();

    const [version] = await db
      .select({
        id: termsOfServiceVersions.id,
        version: termsOfServiceVersions.version,
        title: termsOfServiceVersions.title,
        content: termsOfServiceVersions.content,
        summary: termsOfServiceVersions.summary,
        publishedAt: termsOfServiceVersions.publishedAt,
      })
      .from(termsOfServiceVersions)
      .where(eq(termsOfServiceVersions.status, "published"))
      .orderBy(desc(termsOfServiceVersions.publishedAt))
      .limit(1);

    if (!version) {
      reply.status(404).send({ code: 404, data: null, message: "暂无已发布的服务条款" });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: version,
      message: "ok",
    });
  });
}
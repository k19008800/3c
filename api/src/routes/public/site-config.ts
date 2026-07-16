// ============================================================
//  3cloud (3C) — 公开站点配置（无需认证）
//  GET /api/v1/site-config/public — 获取品牌/站点公开信息
// ============================================================

import { FastifyInstance } from "fastify";
import { like } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema.js";

// 公开暴露的 site_* key 白名单（不要暴露敏感信息）
const PUBLIC_KEYS = new Set([
  "site_name",
  "site_logo_url",
  "site_favicon_url",
  "site_company_name",
  "site_icp",
  "site_icp_link",
  "site_police_icp",
  "site_contact_email",
  "site_contact_phone",
  "site_copyright",
]);

export async function publicSiteConfigRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/site-config/public — 公开品牌配置
  // ──────────────────────────────────────────────

  app.get("/api/v1/site-config/public", async (_request, reply) => {
    const db = getDb();

    const rows = await db
      .select({
        key: systemConfigs.key,
        value: systemConfigs.value,
      })
      .from(systemConfigs)
      .where(like(systemConfigs.key, "site_%"))
      .orderBy(systemConfigs.key);

    const settings: Record<string, string> = {};
    for (const row of rows) {
      if (PUBLIC_KEYS.has(row.key)) {
        settings[row.key] = row.value ?? "";
      }
    }

    reply.status(200).send({
      code: 0,
      data: { settings },
      message: "ok",
    });
  });
}

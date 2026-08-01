import type { FastifyInstance } from "fastify";
import { db, pool } from "../db/index";
import { userPrivacyConsents } from "../db/schema/privacy-policy";
import { userTosConsents } from "../db/schema/terms-of-service";
import { dataExportRequests } from "../db/schema/data-export";
import { resolveConsentStatus, verifyDownloadToken } from "../services/compliance";
import { users } from "../db/schema/users";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

/**
 * 用户端合规 §33
 * - 33.1/33.2 隐私政策 / 服务条款 确认
 * - 33.3 用户数据导出申请（GDPR 数据可携带权）
 */

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function meConsentRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const uid = (req: any) => Number((req as any).user.sub);

  // ============ 隐私政策 / 服务条款 当前版本 + 确认状态 ============

  // 获取当前待确认状态（登录后前端据此决定是否弹出确认窗）
  app.get("/me/consent/status", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const status = await resolveConsentStatus(userId);

    const [privacy, tos] = await Promise.all([
      pool.query(`SELECT id, version, title, summary, published_at FROM privacy_policy_versions WHERE status='published' ORDER BY published_at DESC LIMIT 1`),
      pool.query(`SELECT id, version, title, summary, published_at FROM terms_of_service_versions WHERE status='published' ORDER BY published_at DESC LIMIT 1`),
    ]);

    return {
      code: 0,
      data: {
        status,
        privacy_policy: privacy.rows[0] ?? null,
        terms_of_service: tos.rows[0] ?? null,
      },
      message: "ok",
    };
  });

  // 用户同意当前隐私政策版本
  app.post("/me/consent/privacy", { onRequest: [auth], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const userId = uid(req);
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
    const cur = await pool.query(`SELECT id FROM privacy_policy_versions WHERE status='published' ORDER BY published_at DESC LIMIT 1`);
    const versionId = cur.rows[0]?.id;
    if (!versionId) return reply.code(400).send({ code: 400, error: "NO_PUBLISHED", message: "暂无已发布的隐私政策" });

    await db
      .insert(userPrivacyConsents)
      .values({ userId, versionId, ip })
      .onConflictDoNothing();
    const status = await resolveConsentStatus(userId);
    return { code: 0, data: { ok: true, status }, message: "已确认隐私政策" };
  });

  // 用户同意当前服务条款版本
  app.post("/me/consent/terms", { onRequest: [auth], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const userId = uid(req);
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
    const cur = await pool.query(`SELECT id FROM terms_of_service_versions WHERE status='published' ORDER BY published_at DESC LIMIT 1`);
    const versionId = cur.rows[0]?.id;
    if (!versionId) return reply.code(400).send({ code: 400, error: "NO_PUBLISHED", message: "暂无已发布的服务条款" });

    await db
      .insert(userTosConsents)
      .values({ userId, versionId, ip })
      .onConflictDoNothing();
    const status = await resolveConsentStatus(userId);
    return { code: 0, data: { ok: true, status }, message: "已确认服务条款" };
  });

  // ============ §33.3 用户数据导出 ============

  // 申请导出
  app.post("/me/data-export/request", { onRequest: [auth], schema: { body: { type: "object", additionalProperties: true } } }, async (req) => {
    const userId = uid(req);
    // 防止重复申请：最近 24h 内已有 pending/processing
    const dup = await pool.query(
      `SELECT id FROM data_export_requests WHERE user_id=$1 AND status IN ('pending','processing') AND requested_at > now() - interval '1 day'`,
      [userId],
    );
    if (dup.rows.length) {
      return { code: 0, data: { ok: false, message: "您已有待处理的导出请求，请耐心等待" } };
    }
    const deadline = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const r = await db
      .insert(dataExportRequests)
      .values({ userId, status: "pending", deadline })
      .returning({ id: dataExportRequests.id });
    return { code: 0, data: { ok: true, request_id: r[0]!.id, deadline }, message: "导出申请已提交，管理员将在 24 小时内处理" };
  });

  // 导出请求记录（用户端）
  app.get("/me/data-export/requests", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const rows = await pool.query(
      `SELECT id, requested_at, status, file_size_bytes, file_count, reject_reason, error_message, processed_at, deadline
       FROM data_export_requests WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 20`,
      [userId],
    );
    const list = rows.rows.map((r: any) => ({
      id: r.id,
      requested_at: r.requested_at,
      status: r.status,
      file_size_bytes: r.file_size_bytes,
      file_count: r.file_count,
      reject_reason: r.reject_reason,
      error_message: r.error_message,
      processed_at: r.processed_at,
      deadline: r.deadline,
    }));
    return { code: 0, data: { list }, message: "ok" };
  });

  // 下载导出文件（带签名 token，7 天有效）
  app.get("/me/data-export/download", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const q = req.query as { token?: string };
    const token = q.token;
    const secret = process.env.DATA_EXPORT_SECRET || "data-export-secret";
    if (!token) return reply.code(400).send({ code: 400, error: "MISSING_TOKEN" });
    const decoded = verifyDownloadToken(token, secret);
    if (!decoded || decoded.userId !== userId) return reply.code(403).send({ code: 403, error: "INVALID_TOKEN" });

    const row = await pool.query(`SELECT file_url, file_expires_at FROM data_export_requests WHERE id=$1 AND user_id=$2`, [decoded.requestId, userId]);
    const rec = row.rows[0];
    if (!rec?.file_url) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "导出文件不存在" });
    if (rec.file_expires_at && new Date(rec.file_expires_at) < new Date()) {
      return reply.code(410).send({ code: 410, error: "EXPIRED", message: "下载链接已过期，请重新申请" });
    }
    const fileName = path.basename(rec.file_url);
    const dir = process.env.DATA_EXPORT_DIR || path.join(process.cwd(), "data-exports");
    const fp = path.join(dir, fileName);
    if (!fs.existsSync(fp)) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "导出文件已清理" });
    return reply.header("Content-Disposition", `attachment; filename="${fileName}"`).type("application/zip").send(fs.createReadStream(fp));
  });

  // 更新 users.consent_status 的兜底（登录时调用，确保实时）
  app.post("/me/consent/refresh", { onRequest: [auth], schema: { body: { type: "object", additionalProperties: true } } }, async (req) => {
    const userId = uid(req);
    const status = await resolveConsentStatus(userId);
    await db.update(users).set({ consentStatus: status, updatedAt: new Date() }).where(eq(users.id, userId));
    return { code: 0, data: { status }, message: "ok" };
  });
}

import type { FastifyInstance } from "fastify";
import { db, pool } from "../db/index";
import { privacyPolicyVersions } from "../db/schema/privacy-policy";
import { termsOfServiceVersions } from "../db/schema/terms-of-service";
import { dataExportRequests, userExportJobs } from "../db/schema/data-export";
import { generateUserExport, signDownloadToken, markOverdueExports, cleanupExpiredFiles } from "../services/compliance";
import { sendEmail } from "../services/smtp";
import { eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs";

/**
 * 管理端合规 §33
 * - 33.1 隐私政策版本管理（发布/编辑/回滚/同意统计）
 * - 33.2 服务条款版本管理
 * - 33.3 用户数据导出审核与处理（GDPR）
 */

function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN" });
      }
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function adminConsentRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);
  const adminId = (req: any) => Number((req as any).user.sub);

  // ============ §33.1 隐私政策版本管理 ============

  app.get("/admin/settings/privacy-policy/versions", { onRequest: [admin] }, async (_req) => {
    const rows = await pool.query(
      `SELECT v.*,
        (SELECT count(*) FROM user_privacy_consents c WHERE c.version_id=v.id) AS consent_count
       FROM privacy_policy_versions v ORDER BY created_at DESC`,
    );
    const now = new Date();
    const totalActive = (await pool.query(`SELECT count(*)::int c FROM users WHERE status='active'`)).rows[0].c;
    const list = rows.rows.map((v: any) => ({
      id: v.id, version: v.version, title: v.title, status: v.status,
      published_at: v.published_at, revoked_at: v.revoked_at, summary: v.summary,
      consent_count: Number(v.consent_count),
      pending_count: v.status === "published" ? Math.max(0, totalActive - Number(v.consent_count)) : 0,
      consent_rate: v.status === "published" && totalActive > 0 ? Number((Number(v.consent_count) / totalActive * 100).toFixed(1)) : 0,
    }));
    return { code: 0, data: { list, now, total_active: totalActive }, message: "ok" };
  });

  app.post("/admin/settings/privacy-policy/versions", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const b = req.body as { version?: string; title?: string; content?: string; summary?: string };
    if (!b.version || !b.content) return reply.code(400).send({ code: 400, error: "MISSING_FIELDS", message: "版本号和内容必填" });
    if (b.version?.trim() === "") return reply.code(400).send({ code: 400, error: "BAD_VERSION" });
    const r = await db.insert(privacyPolicyVersions).values({
      version: b.version!, title: b.title || `隐私政策 ${b.version!}`,
      content: b.content, summary: b.summary, status: "draft",
    }).returning({ id: privacyPolicyVersions.id });
    return { code: 0, data: { id: r[0]!.id, status: "draft" }, message: "草稿已创建" };
  });

  app.put("/admin/settings/privacy-policy/versions/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { version?: string; title?: string; content?: string; summary?: string };
    const cur = await db.select().from(privacyPolicyVersions).where(eq(privacyPolicyVersions.id, id)).limit(1);
    if (!cur[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (cur[0].status === "published" && b.content && b.content !== cur[0].content) {
      // 已发布版本内容变更 → 存为新草稿（不直接覆盖已发布，需走新版本发布）
      return reply.code(400).send({ code: 400, error: "PUBLISHED_LOCKED", message: "已发布版本不可直接改内容，请创建新版本" });
    }
    await db.update(privacyPolicyVersions).set({
      ...(b.version ? { version: b.version } : {}),
      ...(b.title ? { title: b.title } : {}),
      ...(b.content ? { content: b.content } : {}),
      ...(b.summary !== undefined ? { summary: b.summary } : {}),
    }).where(eq(privacyPolicyVersions.id, id));
    return { code: 0, data: { ok: true }, message: "已保存" };
  });

  app.post("/admin/settings/privacy-policy/versions/:id/publish", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const cur = await db.select().from(privacyPolicyVersions).where(eq(privacyPolicyVersions.id, id)).limit(1);
    if (!cur[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    // 同版本号已发布冲突检查
    const dup = await pool.query(`SELECT id FROM privacy_policy_versions WHERE version=$1 AND status='published' AND id<>$2`, [cur[0].version, id]);
    if (dup.rows.length) return reply.code(409).send({ code: 409, error: "VERSION_EXISTS", message: "该版本号已发布" });
    await db.update(privacyPolicyVersions).set({ status: "published", publishedAt: new Date(), revokedAt: null }).where(eq(privacyPolicyVersions.id, id));
    return { code: 0, data: { ok: true, published: true }, message: "隐私政策已发布，用户下次登录需重新确认" };
  });

  // 回滚：撤销当前已发布版本，promote 指定版本
  app.post("/admin/settings/privacy-policy/versions/:id/rollback", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    await db.update(privacyPolicyVersions).set({ revokedAt: new Date() }).where(eq(privacyPolicyVersions.status, "published"));
    const t = await db.update(privacyPolicyVersions).set({ status: "published", publishedAt: new Date() }).where(eq(privacyPolicyVersions.id, id));
    if ((t.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "已回滚，用户需重新确认" };
  });

  // ============ §33.2 服务条款版本管理 ============

  app.get("/admin/settings/terms-of-service/versions", { onRequest: [admin] }, async (_req) => {
    const rows = await pool.query(
      `SELECT v.*,
        (SELECT count(*) FROM user_tos_consents c WHERE c.version_id=v.id) AS consent_count
       FROM terms_of_service_versions v ORDER BY created_at DESC`,
    );
    const totalActive = (await pool.query(`SELECT count(*)::int c FROM users WHERE status='active'`)).rows[0].c;
    const list = rows.rows.map((v: any) => ({
      id: v.id, version: v.version, title: v.title, status: v.status,
      published_at: v.published_at, revoked_at: v.revoked_at, summary: v.summary,
      consent_count: Number(v.consent_count),
      pending_count: v.status === "published" ? Math.max(0, totalActive - Number(v.consent_count)) : 0,
      consent_rate: v.status === "published" && totalActive > 0 ? Number((Number(v.consent_count) / totalActive * 100).toFixed(1)) : 0,
    }));
    return { code: 0, data: { list, total_active: totalActive }, message: "ok" };
  });

  app.post("/admin/settings/terms-of-service/versions", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const b = req.body as { version?: string; title?: string; content?: string; summary?: string };
    if (!b.version || !b.content) return reply.code(400).send({ code: 400, error: "MISSING_FIELDS" });
    const r = await db.insert(termsOfServiceVersions).values({
      version: b.version!, title: b.title || `服务条款 ${b.version!}`,
      content: b.content, summary: b.summary, status: "draft",
    }).returning({ id: termsOfServiceVersions.id });
    return { code: 0, data: { id: r[0]!.id, status: "draft" }, message: "草稿已创建" };
  });

  app.put("/admin/settings/terms-of-service/versions/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { version?: string; title?: string; content?: string; summary?: string };
    const cur = await db.select().from(termsOfServiceVersions).where(eq(termsOfServiceVersions.id, id)).limit(1);
    if (!cur[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (cur[0].status === "published" && b.content && b.content !== cur[0].content) {
      return reply.code(400).send({ code: 400, error: "PUBLISHED_LOCKED", message: "已发布版本不可直接改内容，请创建新版本" });
    }
    await db.update(termsOfServiceVersions).set({
      ...(b.version ? { version: b.version } : {}),
      ...(b.title ? { title: b.title } : {}),
      ...(b.content ? { content: b.content } : {}),
      ...(b.summary !== undefined ? { summary: b.summary } : {}),
    }).where(eq(termsOfServiceVersions.id, id));
    return { code: 0, data: { ok: true }, message: "已保存" };
  });

  app.post("/admin/settings/terms-of-service/versions/:id/publish", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const cur = await db.select().from(termsOfServiceVersions).where(eq(termsOfServiceVersions.id, id)).limit(1);
    if (!cur[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const dup = await pool.query(`SELECT id FROM terms_of_service_versions WHERE version=$1 AND status='published' AND id<>$2`, [cur[0].version, id]);
    if (dup.rows.length) return reply.code(409).send({ code: 409, error: "VERSION_EXISTS", message: "该版本号已发布" });
    await db.update(termsOfServiceVersions).set({ status: "published", publishedAt: new Date(), revokedAt: null }).where(eq(termsOfServiceVersions.id, id));
    return { code: 0, data: { ok: true, published: true }, message: "服务条款已发布" };
  });

  app.post("/admin/settings/terms-of-service/versions/:id/rollback", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    await db.update(termsOfServiceVersions).set({ revokedAt: new Date() }).where(eq(termsOfServiceVersions.status, "published"));
    const t = await db.update(termsOfServiceVersions).set({ status: "published", publishedAt: new Date() }).where(eq(termsOfServiceVersions.id, id));
    if ((t.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "已回滚" };
  });

  // ============ §33.3 用户数据导出审核 ============

  app.get("/admin/data-export/requests", { onRequest: [admin] }, async (req) => {
    const q = req.query as { status?: string; keyword?: string; page?: string; page_size?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Number(q.page_size) || 20);
    const offset = (page - 1) * pageSize;
    let where = "1=1";
    const params: any[] = [];
    if (q.status) { params.push(q.status); where += ` AND d.status=$${params.length}`; }
    if (q.keyword) { params.push(`%${q.keyword}%`); where += ` AND (u.email ILIKE $${params.length} OR u.username ILIKE $${params.length})`; }

    const total = (await pool.query(`SELECT count(*)::int c FROM data_export_requests d JOIN users u ON u.id=d.user_id WHERE ${where}`, params)).rows[0].c;
    const rows = await pool.query(
      `SELECT d.*, u.email, u.username,
        (SELECT count(*) FROM user_export_jobs j WHERE j.request_id=d.id) AS part_count
       FROM data_export_requests d JOIN users u ON u.id=d.user_id
       WHERE ${where} ORDER BY d.priority DESC, d.requested_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );
    const list = rows.rows.map((d: any) => ({
      id: d.id, user_id: d.user_id, email: d.email, username: d.username,
      requested_at: d.requested_at, status: d.status, priority: d.priority,
      processed_by: d.processed_by, processed_at: d.processed_at,
      file_size_bytes: d.file_size_bytes, file_count: d.file_count, part_count: Number(d.part_count),
      reject_reason: d.reject_reason, error_message: d.error_message, deadline: d.deadline,
      notification_sent: d.notification_sent,
    }));
    return { code: 0, data: { list, pagination: { page, page_size: pageSize, total } }, message: "ok" };
  });

  app.get("/admin/data-export/stats", { onRequest: [admin] }, async () => {
    const rows = (await pool.query(`SELECT status, count(*)::int c FROM data_export_requests GROUP BY status`)).rows;
    const stats: Record<string, number> = {};
    rows.forEach((r: any) => { stats[r.status] = r.c; });
    return { code: 0, data: stats, message: "ok" };
  });

  // 处理导出（生成 ZIP + 邮件通知）
  app.post("/admin/data-export/:id/process", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const admin = adminId(req);
    const rec = await pool.query(`SELECT * FROM data_export_requests WHERE id=$1`, [id]);
    if (!rec.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });

    // 标记 processing
    await db.update(dataExportRequests).set({ status: "processing", processedBy: admin, processedAt: new Date() }).where(eq(dataExportRequests.id, id));

    try {
      const result = await generateUserExport(id, rec.rows[0].user_id);
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      await db.update(dataExportRequests).set({
        status: "completed", fileUrl: result.fileUrl,
        fileSizeBytes: result.fileSizeBytes, fileCount: result.fileCount,
        fileExpiresAt: expiresAt, errorMessage: null,
      }).where(eq(dataExportRequests.id, id));

      // 写分片记录（单 job）
      await db.insert(userExportJobs).values({
        requestId: id, partNumber: 1, status: "completed", fileUrl: result.fileUrl,
        fileSizeBytes: result.fileSizeBytes, dataType: "all", startedAt: new Date(), completedAt: new Date(),
      });

      // 邮件通知（SMTP 未配置则标记未发送，管理端可手动发链接）
      const secret = process.env.DATA_EXPORT_SECRET || "data-export-secret";
      const token = signDownloadToken(id, rec.rows[0].user_id, secret, expiresAt.getTime());
      const user = (await pool.query(`SELECT email, username FROM users WHERE id=$1`, [rec.rows[0].user_id])).rows[0];
      const downloadUrl = `${process.env.PUBLIC_BASE_URL || "http://localhost:5175"}/data-export/download?token=${token}`;
      const mail = await sendEmail({
        to: user.email,
        subject: "【3Cloud】您的数据导出请求已完成",
        html: `您好 ${user.username}，您的数据导出请求（ID: ${id}）已完成处理。<br/>文件大小：${(result.fileSizeBytes / 1024).toFixed(1)} KB，共 ${result.fileCount} 个文件。<br/>下载链接（7 天内有效）：<a href="${downloadUrl}">${downloadUrl}</a>`,
      });
      if (mail.ok) {
        await db.update(dataExportRequests).set({ notificationSent: true }).where(eq(dataExportRequests.id, id));
      }

      return { code: 0, data: { ok: true, status: "completed", file_url: result.fileUrl, file_size_bytes: result.fileSizeBytes, file_count: result.fileCount, notification_sent: mail.ok, expires_at: expiresAt }, message: "导出已完成" };
    } catch (e: any) {
      await db.update(dataExportRequests).set({ status: "failed", errorMessage: e?.message || String(e) }).where(eq(dataExportRequests.id, id));
      return reply.code(500).send({ code: 500, error: "EXPORT_FAILED", message: e?.message || "导出失败" });
    }
  });

  // 拒绝导出
  app.post("/admin/data-export/:id/reject", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { reason?: string };
    if (!b.reason?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_REASON", message: "拒绝原因必填" });
    const rec = await pool.query(`SELECT user_id FROM data_export_requests WHERE id=$1`, [id]);
    if (!rec.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    await db.update(dataExportRequests).set({ status: "rejected", rejectReason: b.reason, processedBy: adminId(req), processedAt: new Date() }).where(eq(dataExportRequests.id, id));
    const user = (await pool.query(`SELECT email, username FROM users WHERE id=$1`, [rec.rows[0].user_id])).rows[0];
    await sendEmail({ to: user.email, subject: "【3Cloud】数据导出请求未通过", html: `您好 ${user.username}，您的数据导出请求（ID: ${id}）未通过审核。<br/>原因：${b.reason}` });
    return { code: 0, data: { ok: true, status: "rejected" }, message: "已拒绝" };
  });

  // 管理端下载文件（admin 鉴权，无 token）
  app.get("/admin/data-export/files/:requestId/:fileName", { onRequest: [admin] }, async (req, reply) => {
    const fileName = (req.params as any).fileName as string;
    if (!/^export-\d+-\d+-[\d]+\.zip$/.test(fileName)) return reply.code(400).send({ code: 400, error: "BAD_NAME" });
    const dir = process.env.DATA_EXPORT_DIR || path.join(process.cwd(), "data-exports");
    const fp = path.join(dir, fileName);
    if (!fs.existsSync(fp)) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return reply.header("Content-Disposition", `attachment; filename="${fileName}"`).type("application/zip").send(fs.createReadStream(fp));
  });

  // 重新发送通知（completed 但未收到邮件）
  app.post("/admin/data-export/:id/resend", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const rec = (await pool.query(`SELECT * FROM data_export_requests WHERE id=$1 AND status='completed'`, [id])).rows[0];
    if (!rec) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "仅已完成请求可重发" });
    const secret = process.env.DATA_EXPORT_SECRET || "data-export-secret";
    const token = signDownloadToken(id, rec.user_id, secret, Date.now() + 7 * 24 * 3600 * 1000);
    const user = (await pool.query(`SELECT email, username FROM users WHERE id=$1`, [rec.user_id])).rows[0];
    const downloadUrl = `${process.env.PUBLIC_BASE_URL || "http://localhost:5175"}/data-export/download?token=${token}`;
    const mail = await sendEmail({ to: user.email, subject: "【3Cloud】您的数据导出下载链接", html: `您好 ${user.username}，您的数据导出文件下载链接：<a href="${downloadUrl}">${downloadUrl}</a>（7 天内有效）` });
    if (mail.ok) await db.update(dataExportRequests).set({ notificationSent: true }).where(eq(dataExportRequests.id, id));
    return { code: 0, data: { ok: true, notification_sent: mail.ok }, message: mail.ok ? "已发送" : "SMTP 未配置，请手动给用户提供链接" };
  });

  // 批量标记到期 + 清理过期文件（维护端点）
  app.post("/admin/data-export/maintenance", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async () => {
    const overdue = await markOverdueExports();
    const cleaned = await cleanupExpiredFiles();
    return { code: 0, data: { overdue_marked: overdue, files_cleaned: cleaned }, message: "ok" };
  });
}

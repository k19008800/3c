import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db, pool } from "../db/index";
import { announcements, announcementReads } from "../db/schema/announcements";

/**
 * 公告系统
 * 对齐 ref-4.5-marketing.md §3
 * 管理端：发布/编辑/删除/列表 + 阅读统计
 * 用户端：已发布列表（含已读状态）/标记已读/未读数
 */

const TYPE_LABEL: Record<string, string> = {
  system_announcement: "系统公告",
  maintenance: "维护通知",
  activity: "活动通知",
  security: "安全告警",
};

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };
}
function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "需要管理员权限" });
      }
    } catch (e: any) {
      if (e?.statusCode === 403) return;
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function announcementRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const admin = requireAdmin(app);

  // ============================================================
  // 用户端
  // ============================================================

  // 1. 已发布公告列表（含已读状态）
  app.get("/me/announcements", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const rows = await pool.query(
      `SELECT a.id, a.title, a.content, a.type, a.priority, a.created_at,
              EXISTS(SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id=a.id AND ar.user_id=$1) AS is_read
       FROM announcements a WHERE a.status=true ORDER BY a.priority DESC, a.created_at DESC LIMIT 50`,
      [userId],
    );
    return { code: 0, data: { list: rows.rows.map(r => ({ ...r, type_label: TYPE_LABEL[r.type] ?? r.type })) }, message: "ok" };
  });

  // 2. 未读数
  app.get("/me/announcements/unread-count", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM announcements a
       WHERE a.status=true AND NOT EXISTS(SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id=a.id AND ar.user_id=$1)`,
      [userId],
    );
    return { code: 0, data: { unread: Number(r.rows[0]?.n ?? 0) }, message: "ok" };
  });

  // 3. 标记已读
  app.post("/me/announcements/:id/read", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const id = Number((req.params as any).id);
    await db
      .insert(announcementReads)
      .values({ announcementId: id, userId })
      .onConflictDoNothing();
    return { code: 0, data: { ok: true }, message: "ok" };
  });

  // 4. 全部标记已读
  app.post("/me/announcements/read-all", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    await pool.query(
      `INSERT INTO announcement_reads (announcement_id, user_id)
       SELECT id, $1 FROM announcements WHERE status=true
       ON CONFLICT (announcement_id, user_id) DO NOTHING`,
      [userId],
    );
    return { code: 0, data: { ok: true }, message: "ok" };
  });

  // ============================================================
  // 管理端
  // ============================================================

  // 5. 公告列表
  app.get("/admin/announcements", { onRequest: [admin] }, async (req) => {
    const q = req.query as { page?: number; page_size?: number; status?: string };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    if (q.status === "published") where += " AND a.status=true";
    if (q.status === "draft") where += " AND a.status=false";
    params.push(pageSize, offset);
    const rows = await pool.query(
      `SELECT a.*, u.email AS created_by_email,
              (SELECT COUNT(*)::int FROM announcement_reads ar WHERE ar.announcement_id=a.id) AS read_count
       FROM announcements a LEFT JOIN users u ON u.id=a.created_by ${where}
       ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      params,
    );
    return { code: 0, data: { list: rows.rows.map(r => ({ ...r, type_label: TYPE_LABEL[r.type] ?? r.type })) }, message: "ok" };
  });

  // 6. 创建公告
  app.post("/admin/announcements", { onRequest: [admin] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const b = req.body as { title?: string; content?: string; type?: string; priority?: number; publish?: boolean };
    if (!b.title?.trim() || !b.content?.trim()) return reply.code(400).send({ code: 400, error: "MISSING", message: "标题和内容必填" });
    const created = await db
      .insert(announcements)
      .values({ title: b.title.trim(), content: b.content, type: b.type ?? "system_announcement", priority: b.priority ?? 0, status: !!b.publish, createdBy: userId })
      .returning({ id: announcements.id });
    return { code: 0, data: { id: created[0]!.id, published: !!b.publish }, message: b.publish ? "公告已发布" : "公告已保存为草稿" };
  });

  // 7. 编辑公告
  app.put("/admin/announcements/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { title?: string; content?: string; type?: string; priority?: number; publish?: boolean };
    const upd: any = { updatedAt: new Date() };
    if (b.title != null) upd.title = b.title.trim();
    if (b.content != null) upd.content = b.content;
    if (b.type != null) upd.type = b.type;
    if (b.priority != null) upd.priority = b.priority;
    if (b.publish != null) upd.status = !!b.publish;
    const r = await db.update(announcements).set(upd).where(eq(announcements.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "公告已更新" };
  });

  // 8. 删除公告
  app.delete("/admin/announcements/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const r = await db.delete(announcements).where(eq(announcements.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "公告已删除" };
  });

  // 9. 阅读统计
  app.get("/admin/announcements/:id/readers", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    const r = await pool.query(
      `SELECT u.id, u.email, u.username, ar.read_at
       FROM announcement_reads ar JOIN users u ON u.id = ar.user_id
       WHERE ar.announcement_id=$1 ORDER BY ar.read_at DESC LIMIT 100`,
      [id],
    );
    return { code: 0, data: { readers: r.rows }, message: "ok" };
  });
}

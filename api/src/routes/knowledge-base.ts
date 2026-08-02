import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";

/**
 * 知识库 + 快捷回复路由（§10 客服支撑模块）
 * 管理端：CRUD 文章/分类/模板
 * 用户端：查询已发布文章 + 搜索
 * 客服端：搜索知识库 + 快捷回复选用
 */

function toStr(v: any): string {
  return v ?? "";
}

export function knowledgeBaseRoutes(app: FastifyInstance) {
  // ─── 通用认证 ───
  const requireAuth = async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };

  const requireAdmin = async (req: any, reply: any) => {
    await requireAuth(req, reply);
    if (reply.sent) return;
    const role = (req as any).user?.role;
    if (role !== "admin" && role !== "super_admin") {
      return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "仅管理员可操作" });
    }
  };

  // ════════════════════════════════════════════
  // 用户端：已发布文章列表 + 搜索 + 详情 + 反馈
  // ════════════════════════════════════════════

  // GET /me/knowledge-base — 已发布文章列表
  app.get(
    "/me/knowledge-base",
    { onRequest: [requireAuth] },
    async (req) => {
      const query = req.query as any;
      const category = query.category as string | undefined;
      const search = ((query.search as string) ?? "").trim();
      const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
      const offset = Math.max(0, Number(query.offset) || 0);

      let sql = "SELECT id, title, category, tags, view_count, helpful_count, created_at, updated_at FROM knowledge_base_articles WHERE status='published'";
      const params: any[] = [];
      if (category) {
        sql += ` AND category = $${params.length + 1}`;
        params.push(category);
      }
      if (search) {
        sql += ` AND (title ILIKE $${params.length + 1} OR tags ILIKE $${params.length + 1} OR content ILIKE $${params.length + 1})`;
        params.push(`%${search}%`);
      }
      sql += " ORDER BY sort_order ASC NULLS LAST, id DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
      params.push(limit, offset);

      const [rowsR, totalR] = await Promise.all([
        pool.query(sql, params),
        pool.query("SELECT COUNT(*)::int AS cnt FROM knowledge_base_articles WHERE status='published'", []),
      ]);

      return { code: 0, data: { list: rowsR.rows, total: totalR.rows[0]?.cnt ?? 0 }, message: "ok" };
    },
  );

  // GET /me/knowledge-base/:id — 文章详情（用户端）
  app.get(
    "/me/knowledge-base/:id",
    { onRequest: [requireAuth] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const r = await pool.query("SELECT * FROM knowledge_base_articles WHERE id=$1 AND status='published'", [Number(id)]);
      if (!r.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "文章不存在" });

      // 增加阅读计数
      await pool.query("UPDATE knowledge_base_articles SET view_count = view_count + 1 WHERE id=$1", [Number(id)]);

      return { code: 0, data: r.rows[0], message: "ok" };
    },
  );

  // POST /me/knowledge-base/:id/feedback — 文章反馈
  app.post(
    "/me/knowledge-base/:id/feedback",
    { onRequest: [requireAuth] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const articleId = Number(id);
      const userId = Number((req as any).user.sub);
      const body = req.body as { helpful: boolean; comment?: string };

      const r = await pool.query("SELECT id FROM knowledge_base_articles WHERE id=$1 AND status='published'", [articleId]);
      if (!r.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "文章不存在" });

      await pool.query(
        "INSERT INTO knowledge_base_feedback (article_id, user_id, helpful, comment) VALUES ($1, $2, $3, $4)",
        [articleId, userId, body.helpful, body.comment ?? null],
      );

      // 更新统计
      if (body.helpful) {
        await pool.query("UPDATE knowledge_base_articles SET helpful_count = helpful_count + 1 WHERE id=$1", [articleId]);
      } else {
        await pool.query("UPDATE knowledge_base_articles SET unhelpful_count = unhelpful_count + 1 WHERE id=$1", [articleId]);
      }

      return { code: 0, message: "反馈已提交" };
    },
  );

  // GET /me/knowledge-base/categories — 分类列表
  app.get(
    "/me/knowledge-base/categories",
    { onRequest: [requireAuth] },
    async () => {
      const r = await pool.query("SELECT * FROM knowledge_base_categories ORDER BY sort_order ASC, id ASC");
      return { code: 0, data: { list: r.rows }, message: "ok" };
    },
  );

  // ════════════════════════════════════════════
  // 管理端：文章 CRUD
  // ════════════════════════════════════════════

  // GET /admin/knowledge-base — 全部文章（含草稿）
  app.get(
    "/admin/knowledge-base",
    { onRequest: [requireAdmin] },
    async (req) => {
      const query = req.query as any;
      const status = query.status as string | undefined;
      const search = ((query.search as string) ?? "").trim();
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const offset = Math.max(0, Number(query.offset) || 0);

      let sql = "SELECT kba.*, u.username AS author_name FROM knowledge_base_articles kba LEFT JOIN users u ON u.id = kba.author_id";
      const params: any[] = [];
      const wheres: string[] = [];
      if (status && ["draft", "published", "archived"].includes(status)) {
        wheres.push(`kba.status = $${params.length + 1}`);
        params.push(status);
      }
      if (search) {
        wheres.push(`(kba.title ILIKE $${params.length + 1} OR kba.tags ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
      }
      if (wheres.length > 0) sql += " WHERE " + wheres.join(" AND ");
      sql += " ORDER BY kba.updated_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
      params.push(limit, offset);

      const whereCount = wheres.length > 0 ? " WHERE " + wheres.join(" AND ") : "";
      const [rowsR, totalR] = await Promise.all([
        pool.query(sql, params),
        pool.query("SELECT COUNT(*)::int AS cnt FROM knowledge_base_articles kba" + whereCount, params.length > 0 ? [status] : []),
      ]);

      // 修复 total 参数
      const totalP = status && ["draft", "published", "archived"].includes(status) ? [status] : [];
      const totalR2 = await pool.query("SELECT COUNT(*)::int AS cnt FROM knowledge_base_articles" + (totalP.length > 0 ? " WHERE status=$1" : ""), totalP);

      return { code: 0, data: { list: rowsR.rows, total: totalR2.rows[0]?.cnt ?? 0 }, message: "ok" };
    },
  );

  // POST /admin/knowledge-base — 创建文章
  app.post(
    "/admin/knowledge-base",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const body = req.body as any;
      if (!body.title?.trim()) return reply.code(400).send({ code: 400, error: "VALIDATION_ERROR", message: "标题不能为空" });

      const r = await pool.query(
        `INSERT INTO knowledge_base_articles (title, category, content, tags, status, author_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [body.title.trim(), body.category ?? null, body.content ?? null, body.tags ?? null, body.status ?? "draft", userId],
      );
      return reply.code(201).send({ code: 0, data: r.rows[0], message: "文章创建成功" });
    },
  );

  // PUT /admin/knowledge-base/:id — 更新文章
  app.put(
    "/admin/knowledge-base/:id",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      const articleId = Number(id);

      const exist = await pool.query("SELECT id FROM knowledge_base_articles WHERE id=$1", [articleId]);
      if (!exist.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "文章不存在" });

      const sets: string[] = [];
      const params: any[] = [];
      const fields = ["title", "category", "content", "tags", "status"];
      for (const f of fields) {
        if (body[f] !== undefined) {
          sets.push(`${f} = $${params.length + 1}`);
          params.push(body[f]);
        }
      }
      sets.push("updated_at = NOW()");
      if (body.status === "published") {
        sets.push("published_at = NOW()");
      }
      params.push(articleId);
      await pool.query(`UPDATE knowledge_base_articles SET ${sets.join(", ")} WHERE id = $${params.length}`, params);

      const updated = await pool.query("SELECT * FROM knowledge_base_articles WHERE id=$1", [articleId]);
      return { code: 0, data: updated.rows[0], message: "文章已更新" };
    },
  );

  // DELETE /admin/knowledge-base/:id — 删除文章
  app.delete(
    "/admin/knowledge-base/:id",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await pool.query("DELETE FROM knowledge_base_articles WHERE id=$1", [Number(id)]);
      return { code: 0, message: "文章已删除" };
    },
  );

  // ════════════════════════════════════════════
  // 管理端：分类 CRUD
  // ════════════════════════════════════════════

  // GET /admin/knowledge-base/categories
  app.get(
    "/admin/knowledge-base/categories",
    { onRequest: [requireAdmin] },
    async () => {
      const r = await pool.query("SELECT * FROM knowledge_base_categories ORDER BY sort_order ASC, id ASC");
      return { code: 0, data: { list: r.rows }, message: "ok" };
    },
  );

  // POST /admin/knowledge-base/categories
  app.post(
    "/admin/knowledge-base/categories",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const body = req.body as any;
      if (!body.name?.trim() || !body.slug?.trim()) {
        return reply.code(400).send({ code: 400, error: "VALIDATION_ERROR", message: "名称和别名不能为空" });
      }
      const r = await pool.query(
        "INSERT INTO knowledge_base_categories (name, slug, description, sort_order) VALUES ($1, $2, $3, $4) RETURNING *",
        [body.name.trim(), body.slug.trim(), body.description ?? null, body.sort_order ?? 0],
      );
      return reply.code(201).send({ code: 0, data: r.rows[0], message: "分类创建成功" });
    },
  );

  // PUT /admin/knowledge-base/categories/:id
  app.put(
    "/admin/knowledge-base/categories/:id",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      const exist = await pool.query("SELECT id FROM knowledge_base_categories WHERE id=$1", [Number(id)]);
      if (!exist.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "分类不存在" });

      const sets: string[] = [];
      const params: any[] = [];
      for (const f of ["name", "slug", "description", "sort_order"]) {
        if (body[f] !== undefined) { sets.push(`${f} = $${params.length + 1}`); params.push(body[f]); }
      }
      params.push(Number(id));
      await pool.query(`UPDATE knowledge_base_categories SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
      const updated = await pool.query("SELECT * FROM knowledge_base_categories WHERE id=$1", [Number(id)]);
      return { code: 0, data: updated.rows[0], message: "分类已更新" };
    },
  );

  // DELETE /admin/knowledge-base/categories/:id
  app.delete(
    "/admin/knowledge-base/categories/:id",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await pool.query("DELETE FROM knowledge_base_categories WHERE id=$1", [Number(id)]);
      return { code: 0, message: "分类已删除" };
    },
  );

  // ════════════════════════════════════════════
  // 快捷回复模板（客服端/管理端）
  // ════════════════════════════════════════════

  // GET /admin/quick-replies — 全部模板
  app.get(
    "/admin/quick-replies",
    { onRequest: [requireAdmin] },
    async () => {
      const r = await pool.query("SELECT qrt.*, u.username AS created_by_name FROM quick_reply_templates qrt LEFT JOIN users u ON u.id = qrt.created_by ORDER BY qrt.sort_order ASC, qrt.id ASC");
      return { code: 0, data: { list: r.rows }, message: "ok" };
    },
  );

  // POST /admin/quick-replies — 创建模板
  app.post(
    "/admin/quick-replies",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const body = req.body as any;
      if (!body.name?.trim() || !body.content?.trim()) {
        return reply.code(400).send({ code: 400, error: "VALIDATION_ERROR", message: "名称和内容不能为空" });
      }
      const r = await pool.query(
        "INSERT INTO quick_reply_templates (name, category, content, sort_order, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [body.name.trim(), body.category ?? null, body.content, body.sort_order ?? 0, userId],
      );
      return reply.code(201).send({ code: 0, data: r.rows[0], message: "模板创建成功" });
    },
  );

  // PUT /admin/quick-replies/:id — 更新模板
  app.put(
    "/admin/quick-replies/:id",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      const exist = await pool.query("SELECT id FROM quick_reply_templates WHERE id=$1", [Number(id)]);
      if (!exist.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "模板不存在" });

      const sets: string[] = [];
      const params: any[] = [];
      for (const f of ["name", "category", "content", "sort_order"]) {
        if (body[f] !== undefined) { sets.push(`${f} = $${params.length + 1}`); params.push(body[f]); }
      }
      sets.push("updated_at = NOW()");
      params.push(Number(id));
      await pool.query(`UPDATE quick_reply_templates SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
      const updated = await pool.query("SELECT * FROM quick_reply_templates WHERE id=$1", [Number(id)]);
      return { code: 0, data: updated.rows[0], message: "模板已更新" };
    },
  );

  // DELETE /admin/quick-replies/:id — 删除模板
  app.delete(
    "/admin/quick-replies/:id",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await pool.query("DELETE FROM quick_reply_templates WHERE id=$1", [Number(id)]);
      return { code: 0, message: "模板已删除" };
    },
  );
}

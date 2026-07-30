import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../../../db/index.js";
import { quickReplyTemplates, qrtCategories, NewQRTemplate, NewQRCategory } from "../../../db/schema/quick-reply.js";
import { eq, and, desc, like, sql, asc } from "drizzle-orm";

// ── 类型定义 ──
interface TemplateQuery {
  scope?: string;
  categoryId?: string;
  page?: string;
  limit?: string;
}

interface SearchQuery {
  q?: string;
  limit?: string;
}

// ── 路由注册 ──
export async function adminQuickReplyRoutes(app: FastifyInstance) {
  const db = getDb();

  // ── 模板 CRUD ──

  // 获取模板列表
  app.get<{ Querystring: TemplateQuery }>("/api/v1/admin/support/templates", async (req, reply) => {
    const { scope, categoryId, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    if (scope) conditions.push(eq(quickReplyTemplates.scope, scope));
    if (categoryId) conditions.push(eq(quickReplyTemplates.categoryId, parseInt(categoryId)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      db.select().from(quickReplyTemplates)
        .where(where)
        .orderBy(desc(quickReplyTemplates.isPinned), asc(quickReplyTemplates.sortOrder), desc(quickReplyTemplates.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(quickReplyTemplates).where(where),
    ]);

    return { code: 0, data: { list: items, total: Number(countResult[0].count), page: pageNum, limit: limitNum } };
  });

  // 创建模板
  app.post<{ Body: NewQRTemplate }>("/api/v1/admin/support/templates", async (req, reply) => {
    const { title, content, categoryId, scope, ownerId, teamId, isPinned, sortOrder } = req.body;
    if (!title || !content) {
      return reply.status(400).send({ code: 400, message: "标题和内容不能为空" });
    }
    const [created] = await db.insert(quickReplyTemplates).values({
      title, content,
      categoryId: categoryId || null,
      scope: scope || "personal",
      ownerId: ownerId || (req as any).user?.id,
      teamId: teamId || null,
      isPinned: isPinned ?? false,
      sortOrder: sortOrder ?? 0,
    }).returning();
    return { code: 0, data: created };
  });

  // 编辑模板
  app.patch<{ Params: { id: string }; Body: Partial<NewQRTemplate> }>("/api/v1/admin/support/templates/:id", async (req, reply) => {
    const id = parseInt(req.params.id);
    const { title, content, categoryId, scope, teamId, isPinned, sortOrder } = req.body;
    const [updated] = await db.update(quickReplyTemplates)
      .set({
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(scope !== undefined && { scope }),
        ...(teamId !== undefined && { teamId }),
        ...(isPinned !== undefined && { isPinned }),
        ...(sortOrder !== undefined && { sortOrder }),
        updatedAt: sql`NOW()`,
      })
      .where(eq(quickReplyTemplates.id, id))
      .returning();
    if (!updated) return reply.status(404).send({ code: 404, message: "模板不存在" });
    return { code: 0, data: updated };
  });

  // 删除模板
  app.delete<{ Params: { id: string } }>("/api/v1/admin/support/templates/:id", async (req, reply) => {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(quickReplyTemplates).where(eq(quickReplyTemplates.id, id)).returning();
    if (!deleted) return reply.status(404).send({ code: 404, message: "模板不存在" });
    return { code: 0, data: deleted };
  });

  // 置顶/取消置顶
  app.patch<{ Params: { id: string }; Body: { pinned: boolean } }>("/api/v1/admin/support/templates/:id/pin", async (req, reply) => {
    const id = parseInt(req.params.id);
    const { pinned } = req.body;
    const [updated] = await db.update(quickReplyTemplates)
      .set({ isPinned: pinned, updatedAt: sql`NOW()` })
      .where(eq(quickReplyTemplates.id, id))
      .returning();
    if (!updated) return reply.status(404).send({ code: 404, message: "模板不存在" });
    return { code: 0, data: updated };
  });

  // 复制模板到个人库
  app.post<{ Params: { id: string } }>("/api/v1/admin/support/templates/:id/copy", async (req, reply) => {
    const id = parseInt(req.params.id);
    const [original] = await db.select().from(quickReplyTemplates).where(eq(quickReplyTemplates.id, id)).limit(1);
    if (!original) return reply.status(404).send({ code: 404, message: "模板不存在" });
    const [copied] = await db.insert(quickReplyTemplates).values({
      title: original.title,
      content: original.content,
      categoryId: original.categoryId,
      scope: "personal",
      ownerId: (req as any).user?.id,
      isPinned: false,
      sortOrder: 0,
    }).returning();
    return { code: 0, data: copied };
  });

  // 记录模板使用
  app.post<{ Params: { id: string } }>("/api/v1/admin/support/templates/:id/use", async (req, reply) => {
    const id = parseInt(req.params.id);
    await db.update(quickReplyTemplates)
      .set({ useCount: sql`use_count + 1` })
      .where(eq(quickReplyTemplates.id, id));
    return { code: 0, message: "ok" };
  });

  // 搜索模板
  app.get<{ Querystring: SearchQuery }>("/api/v1/admin/support/templates/search", async (req, reply) => {
    const { q, limit = "10" } = req.query;
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    if (!q) return { code: 0, data: [] };
    const items = await db.select().from(quickReplyTemplates)
      .where(sql`title ILIKE ${"%" + q + "%"} OR content ILIKE ${"%" + q + "%"}`)
      .orderBy(desc(quickReplyTemplates.isPinned), desc(quickReplyTemplates.useCount))
      .limit(limitNum);
    return { code: 0, data: items };
  });

  // 常用模板 Top 5
  app.get("/api/v1/admin/support/templates/frequent", async (req, reply) => {
    const items = await db.select().from(quickReplyTemplates)
      .orderBy(desc(quickReplyTemplates.useCount))
      .limit(5);
    return { code: 0, data: items };
  });

  // ── 分类 CRUD ──

  // 分类列表
  app.get("/api/v1/admin/support/templates/categories", async (req, reply) => {
    const items = await db.select().from(qrtCategories).orderBy(asc(qrtCategories.sortOrder));
    return { code: 0, data: items };
  });

  // 创建分类
  app.post<{ Body: NewQRCategory }>("/api/v1/admin/support/templates/categories", async (req, reply) => {
    const { name, icon, sortOrder } = req.body;
    if (!name) return reply.status(400).send({ code: 400, message: "分类名称不能为空" });
    const [created] = await db.insert(qrtCategories).values({
      name,
      icon: icon || null,
      sortOrder: sortOrder ?? 0,
    }).returning();
    return { code: 0, data: created };
  });

  // 编辑分类
  app.patch<{ Params: { id: string }; Body: Partial<NewQRCategory> }>("/api/v1/admin/support/templates/categories/:id", async (req, reply) => {
    const id = parseInt(req.params.id);
    const { name, icon, sortOrder } = req.body;
    const [updated] = await db.update(qrtCategories)
      .set({
        ...(name !== undefined && { name }),
        ...(icon !== undefined && { icon }),
        ...(sortOrder !== undefined && { sortOrder }),
      })
      .where(eq(qrtCategories.id, id))
      .returning();
    if (!updated) return reply.status(404).send({ code: 404, message: "分类不存在" });
    return { code: 0, data: updated };
  });

  // 删除分类
  app.delete<{ Params: { id: string } }>("/api/v1/admin/support/templates/categories/:id", async (req, reply) => {
    const id = parseInt(req.params.id);
    const [count] = await db.select({ count: sql<number>`count(*)` })
      .from(quickReplyTemplates)
      .where(eq(quickReplyTemplates.categoryId, id));
    if (Number(count.count) > 0) {
      return reply.status(400).send({ code: 400, message: `该分类下有 ${count.count} 个模板，请先转移` });
    }
    const [deleted] = await db.delete(qrtCategories).where(eq(qrtCategories.id, id)).returning();
    if (!deleted) return reply.status(404).send({ code: 404, message: "分类不存在" });
    return { code: 0, data: deleted };
  });
}
// ============================================================
//  3cloud (3C) — 知识库系统 管理后台 API（§10.2）
// ============================================================

import { FastifyPluginAsync } from "fastify";
import { eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { knowledgeBase, knowledgeCategories } from "../../../db/schema/knowledge.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";

export const adminKnowledgeRoutes: FastifyPluginAsync = async (app) => {
  const db = getDb();

  // 所有管理端 API 需要认证 + SUPPORT_MANAGE 权限
  app.addHook("onRequest", authenticateJWT);
  app.addHook("onRequest", requirePerm(Perm.SUPPORT_MANAGE));

  // ── 分类 CRUD ──

  app.get("/api/v1/admin/knowledge/categories", async (req, reply) => {
    const categories = await db
      .select({
        id: knowledgeCategories.id,
        name: knowledgeCategories.name,
        slug: knowledgeCategories.slug,
        description: knowledgeCategories.description,
        sortOrder: knowledgeCategories.sortOrder,
        articleCount: sql<number>`(SELECT COUNT(*) FROM ${knowledgeBase} WHERE ${knowledgeBase.categoryId} = ${knowledgeCategories.id})`,
      })
      .from(knowledgeCategories)
      .orderBy(asc(knowledgeCategories.sortOrder), asc(knowledgeCategories.id));

    return reply.send({ code: 0, data: { categories } });
  });

  app.post("/api/v1/admin/knowledge/categories", async (req, reply) => {
    const { name, slug, description, sortOrder } = req.body as any;
    if (!name || !slug) return reply.status(400).send({ code: 400, message: "名称和别名不能为空" });

    const [cat] = await db.insert(knowledgeCategories).values({
      name, slug, description: description || null, sortOrder: sortOrder || 0,
    }).returning();

    return reply.send({ code: 0, data: { category: cat } });
  });

  app.put("/api/v1/admin/knowledge/categories/:id", async (req, reply) => {
    const { id } = req.params as any;
    const updates = req.body as any;
    const [cat] = await db.update(knowledgeCategories)
      .set({ ...updates, updatedAt: sql`NOW()` })
      .where(eq(knowledgeCategories.id, Number(id)))
      .returning();
    if (!cat) return reply.status(404).send({ code: 404, message: "分类不存在" });
    return reply.send({ code: 0, data: { category: cat } });
  });

  app.delete("/api/v1/admin/knowledge/categories/:id", async (req, reply) => {
    const { id } = req.params as any;
    await db.delete(knowledgeCategories).where(eq(knowledgeCategories.id, Number(id)));
    return reply.send({ code: 0, data: null });
  });

  // ── 文章 CRUD ──

  app.get("/api/v1/admin/knowledge", async (req, reply) => {
    const query = req.query as any;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Number(query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = query.status as string | undefined;
    const search = query.search as string | undefined;
    const categoryId = query.categoryId as string | undefined;

    const conditions: any[] = [];
    if (status) conditions.push(eq(knowledgeBase.status, status));
    if (categoryId) conditions.push(eq(knowledgeBase.categoryId, Number(categoryId)));
    if (search) conditions.push(or(
      like(knowledgeBase.title, `%${search}%`),
      like(knowledgeBase.tags, `%${search}%`),
    ));

    const where = conditions.length > 0
      ? (conditions as any).reduce((a: any, b: any) => sql`${a} AND ${b}`)
      : undefined;

    const [articles, [{ count }]] = await Promise.all([
      db
        .select({
          id: knowledgeBase.id,
          title: knowledgeBase.title,
          summary: knowledgeBase.summary,
          categoryId: knowledgeBase.categoryId,
          categoryName: knowledgeCategories.name,
          status: knowledgeBase.status,
          tags: knowledgeBase.tags,
          authorId: knowledgeBase.authorId,
          viewCount: knowledgeBase.viewCount,
          helpfulCount: knowledgeBase.helpfulCount,
          version: knowledgeBase.version,
          createdAt: knowledgeBase.createdAt,
          updatedAt: knowledgeBase.updatedAt,
          publishedAt: knowledgeBase.publishedAt,
        })
        .from(knowledgeBase)
        .leftJoin(knowledgeCategories, eq(knowledgeBase.categoryId, knowledgeCategories.id))
        .where(where)
        .orderBy(desc(knowledgeBase.updatedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`COUNT(*)` }).from(knowledgeBase).where(where),
    ]);

    return reply.send({
      code: 0,
      data: { articles, total: Number(count), page, totalPages: Math.ceil(Number(count) / limit) },
    });
  });

  app.post("/api/v1/admin/knowledge", async (req, reply) => {
    const body = req.body as any;
    if (!body.title || !body.content) return reply.status(400).send({ code: 400, message: "标题和内容不能为空" });

    const adminUser = (req as any).adminUser || { id: 0 };
    const [article] = await db.insert(knowledgeBase).values({
      title: body.title,
      content: body.content,
      summary: body.summary || null,
      categoryId: body.categoryId || null,
      tags: body.tags || null,
      status: body.status || "draft",
      authorId: adminUser.id,
    }).returning();

    return reply.send({ code: 0, data: { article } });
  });

  app.get("/api/v1/admin/knowledge/:id", async (req, reply) => {
    const { id } = req.params as any;
    const [article] = await db
      .select({
        id: knowledgeBase.id,
        title: knowledgeBase.title,
        content: knowledgeBase.content,
        summary: knowledgeBase.summary,
        categoryId: knowledgeBase.categoryId,
        categoryName: knowledgeCategories.name,
        tags: knowledgeBase.tags,
        status: knowledgeBase.status,
        authorId: knowledgeBase.authorId,
        viewCount: knowledgeBase.viewCount,
        helpfulCount: knowledgeBase.helpfulCount,
        version: knowledgeBase.version,
        createdAt: knowledgeBase.createdAt,
        updatedAt: knowledgeBase.updatedAt,
        publishedAt: knowledgeBase.publishedAt,
      })
      .from(knowledgeBase)
      .leftJoin(knowledgeCategories, eq(knowledgeBase.categoryId, knowledgeCategories.id))
      .where(eq(knowledgeBase.id, Number(id)));

    if (!article) return reply.status(404).send({ code: 404, message: "文章不存在" });
    return reply.send({ code: 0, data: { article } });
  });

  app.put("/api/v1/admin/knowledge/:id", async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    const updates: any = { updatedAt: sql`NOW()`, version: sql`version + 1` };
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.summary !== undefined) updates.summary = body.summary;
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (body.tags !== undefined) updates.tags = body.tags;

    const [article] = await db.update(knowledgeBase)
      .set(updates)
      .where(eq(knowledgeBase.id, Number(id)))
      .returning();
    if (!article) return reply.status(404).send({ code: 404, message: "文章不存在" });
    return reply.send({ code: 0, data: { article } });
  });

  app.delete("/api/v1/admin/knowledge/:id", async (req, reply) => {
    const { id } = req.params as any;
    await db.delete(knowledgeBase).where(eq(knowledgeBase.id, Number(id)));
    return reply.send({ code: 0, data: null });
  });

  app.post("/api/v1/admin/knowledge/:id/publish", async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    const newStatus = body.status === "published" ? "published" : "draft";
    const updates: any = { status: newStatus, updatedAt: sql`NOW()` };
    if (newStatus === "published") updates.publishedAt = sql`NOW()`;
    const [article] = await db.update(knowledgeBase)
      .set(updates)
      .where(eq(knowledgeBase.id, Number(id)))
      .returning();
    return reply.send({ code: 0, data: { article } });
  });
};
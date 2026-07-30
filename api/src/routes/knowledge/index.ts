// ============================================================
//  3cloud (3C) — 知识库系统 公开 API（§10.2）
//  GET    /api/v1/knowledge/categories  — 公开分类列表
//  GET    /api/v1/knowledge             — 公开文章列表
//  GET    /api/v1/knowledge/:id         — 公开文章详情
//  POST   /api/v1/knowledge/:id/helpful — 反馈有用
// ============================================================

import { FastifyPluginAsync } from "fastify";
import { eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { knowledgeBase, knowledgeCategories } from "../../db/schema/knowledge.js";

export const knowledgePublicRoutes: FastifyPluginAsync = async (app) => {
  const db = getDb();

  app.get("/api/v1/knowledge/categories", async (req, reply) => {
    const categories = await db
      .select({
        id: knowledgeCategories.id,
        name: knowledgeCategories.name,
        slug: knowledgeCategories.slug,
        sortOrder: knowledgeCategories.sortOrder,
        articleCount: sql<number>`(SELECT COUNT(*) FROM ${knowledgeBase} WHERE ${knowledgeBase.categoryId} = ${knowledgeCategories.id} AND ${knowledgeBase.status} = 'published')`,
      })
      .from(knowledgeCategories)
      .orderBy(asc(knowledgeCategories.sortOrder));
    return reply.send({ code: 0, data: { categories } });
  });

  app.get("/api/v1/knowledge", async (req, reply) => {
    const query = req.query as any;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Number(query.limit) || 20);
    const offset = (page - 1) * limit;
    const search = query.search as string | undefined;
    const categoryId = query.categoryId as string | undefined;

    const conditions: any[] = [eq(knowledgeBase.status, "published")];
    if (categoryId) conditions.push(eq(knowledgeBase.categoryId, Number(categoryId)));
    if (search) conditions.push(or(
      like(knowledgeBase.title, `%${search}%`),
      like(knowledgeBase.tags, `%${search}%`),
    ));

    const where = (conditions as any).reduce((a: any, b: any) => sql`${a} AND ${b}`);

    const [articles, [{ count }]] = await Promise.all([
      db
        .select({
          id: knowledgeBase.id,
          title: knowledgeBase.title,
          summary: knowledgeBase.summary,
          categoryId: knowledgeBase.categoryId,
          categoryName: knowledgeCategories.name,
          tags: knowledgeBase.tags,
          viewCount: knowledgeBase.viewCount,
          helpfulCount: knowledgeBase.helpfulCount,
          publishedAt: knowledgeBase.publishedAt,
        })
        .from(knowledgeBase)
        .leftJoin(knowledgeCategories, eq(knowledgeBase.categoryId, knowledgeCategories.id))
        .where(where)
        .orderBy(desc(knowledgeBase.publishedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`COUNT(*)` }).from(knowledgeBase).where(where),
    ]);

    return reply.send({
      code: 0,
      data: { articles, total: Number(count), page, totalPages: Math.ceil(Number(count) / limit) },
    });
  });

  app.get("/api/v1/knowledge/:id", async (req, reply) => {
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
        viewCount: knowledgeBase.viewCount,
        helpfulCount: knowledgeBase.helpfulCount,
        publishedAt: knowledgeBase.publishedAt,
      })
      .from(knowledgeBase)
      .leftJoin(knowledgeCategories, eq(knowledgeBase.categoryId, knowledgeCategories.id))
      .where(and(eq(knowledgeBase.id, Number(id)), eq(knowledgeBase.status, "published")));

    if (!article) return reply.status(404).send({ code: 404, message: "文章不存在或未发布" });

    db.update(knowledgeBase).set({ viewCount: sql`view_count + 1` })
      .where(eq(knowledgeBase.id, Number(id))).then(() => {});

    return reply.send({ code: 0, data: { article } });
  });

  app.post("/api/v1/knowledge/:id/helpful", async (req, reply) => {
    const { id } = req.params as any;
    await db.update(knowledgeBase)
      .set({ helpfulCount: sql`helpful_count + 1` })
      .where(eq(knowledgeBase.id, Number(id)));
    return reply.send({ code: 0, data: null });
  });
};
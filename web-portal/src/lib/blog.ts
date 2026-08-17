/**
 * Portal 博客数据访问（P2-3）
 *
 * 消费公开端点 GET /api/v1/public/blog（列表，只含 published + type=blog）
 * 与 GET /api/v1/public/blog/:slug（详情）。服务端 fetch，no-store。
 *
 * @module lib/blog
 */

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

export interface BlogPostSummary {
  id: number;
  slug: string;
  title: string;
  updated_at: string;
}

export interface BlogPostDetail extends BlogPostSummary {
  content: string;
}

/** 博客列表（分页；失败返回空列表） */
export async function fetchBlogList(page = 1, pageSize = 20): Promise<{ items: BlogPostSummary[]; total: number }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/blog?page=${page}&pageSize=${pageSize}`, { cache: "no-store" });
    if (res.ok) {
      const body = await res.json();
      const data = body?.data;
      if (data && Array.isArray(data.items)) {
        return { items: data.items as BlogPostSummary[], total: Number(data.total ?? data.items.length) };
      }
    }
  } catch {
    /* 拉取失败 → 空列表 */
  }
  return { items: [], total: 0 };
}

/** 博客详情（slug 不存在/未发布返回 null） */
export async function fetchBlogPost(slug: string): Promise<BlogPostDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/blog/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (res.ok) {
      const body = await res.json();
      const data = body?.data;
      if (data && typeof data.title === "string") return data as BlogPostDetail;
    }
  } catch {
    /* 拉取失败 → null */
  }
  return null;
}

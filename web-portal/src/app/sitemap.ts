import type { MetadataRoute } from "next";
import { fetchBlogList } from "../lib/blog";

/**
 * sitemap.xml（P2-3）— 站点地图
 *
 * 包含全部主要页面（/ /about /models /pricing /status /blog）
 * + /blog/:slug 动态文章（从 GET /api/v1/public/blog 拉取，只含 published + blog）。
 * 站点域名取 SITE_BASE_URL 环境变量（缺省 https://3cloud.dev，部署时按实际域名配置）。
 * force-dynamic：每次请求实时生成，文章发布后自动出现在 sitemap 中。
 */

export const dynamic = "force-dynamic";

const BASE = process.env.SITE_BASE_URL ?? "https://3cloud.dev";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" | "daily" }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/about", priority: 0.8, changeFrequency: "monthly" },
    { path: "/models", priority: 0.8, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "weekly" },
    { path: "/status", priority: 0.6, changeFrequency: "daily" },
    { path: "/blog", priority: 0.8, changeFrequency: "weekly" },
  ];

  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${BASE}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // 动态博客文章（最多 100 篇）
  const { items } = await fetchBlogList(1, 100);
  for (const post of items) {
    entries.push({
      url: `${BASE}/blog/${post.slug}`,
      lastModified: post.updated_at ? new Date(post.updated_at) : new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  return entries;
}

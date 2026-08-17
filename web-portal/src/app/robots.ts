import type { MetadataRoute } from "next";

/**
 * robots.txt（P2-3）— 允许全部爬虫抓取，并指向 sitemap.xml
 */

const BASE = process.env.SITE_BASE_URL ?? "https://3cloud.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}

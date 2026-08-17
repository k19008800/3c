import type { Metadata } from "next";
import { fetchDictionary, makeT, resolveLang, siteAlternates } from "../../lib/i18n";
import { getCookieLang } from "../../lib/i18n-server";
import { PageHelp } from "../../components/Help";
import { fetchBlogList } from "../../lib/blog";

/**
 * 博客列表页（P2-3）— 服务端渲染
 *
 * 数据源：GET /api/v1/public/blog（只含 published + type=blog）。
 * 标题旁带 [?] 页面帮助；列表项链接到 /blog/:slug。
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const lang = resolveLang(sp?.lang, await getCookieLang());
  const dict = await fetchDictionary(lang);
  const t = makeT(dict);
  return {
    title: t("blog.title"),
    description: t("blog.subtitle"),
    openGraph: {
      title: t("blog.title"),
      description: t("blog.subtitle"),
      type: "website",
    },
    alternates: siteAlternates("/blog"),
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = resolveLang(sp?.lang, await getCookieLang());
  const dict = await fetchDictionary(lang);
  const t = makeT(dict);

  const { items } = await fetchBlogList(1, 50);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
        {t("blog.title")}
        <PageHelp text={t("help.blog")} />
      </h1>
      <p style={{ color: "#64748b", marginBottom: 40, fontSize: 15 }}>{t("blog.subtitle")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((post) => (
          <a
            key={post.id}
            href={`/blog/${post.slug}`}
            style={{
              display: "block",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "20px 24px",
              background: "#fff",
              textDecoration: "none",
              color: "inherit",
              transition: "box-shadow .2s",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#0f172a" }}>{post.title}</h2>
            {post.updated_at && (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>
                {t("blog.publishedAt")} {formatDate(post.updated_at)}
              </div>
            )}
          </a>
        ))}
      </div>

      {items.length === 0 && (
        <p style={{ color: "#94a3b8", textAlign: "center", padding: 60 }}>{t("blog.empty")}</p>
      )}
    </div>
  );
}

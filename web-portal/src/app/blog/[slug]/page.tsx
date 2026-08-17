import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchDictionary, makeT, resolveLang, siteAlternates } from "../../../lib/i18n";
import { getCookieLang } from "../../../lib/i18n-server";
import { PageHelp } from "../../../components/Help";
import { fetchBlogPost } from "../../../lib/blog";

/**
 * 博客详情页（P2-3）— 服务端渲染，按 slug 拉取
 *
 * 数据源：GET /api/v1/public/blog/:slug；不存在/未发布 → 404（notFound()）。
 * SEO：generateMetadata 用文章标题做 title；标题旁带 [?] 页面帮助。
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const lang = resolveLang(sp?.lang, await getCookieLang());
  const dict = await fetchDictionary(lang);
  const t = makeT(dict);

  const post = await fetchBlogPost(slug);
  if (!post) {
    return {
      title: t("blog.notFound"),
      description: t("blog.subtitle"),
      alternates: siteAlternates(`/blog/${slug}`),
    };
  }
  return {
    title: post.title,
    description: t("blog.subtitle"),
    openGraph: {
      title: post.title,
      description: t("blog.subtitle"),
      type: "article",
      publishedTime: post.updated_at,
      modifiedTime: post.updated_at,
    },
    alternates: siteAlternates(`/blog/${post.slug}`),
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default async function BlogPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const lang = resolveLang(sp?.lang, await getCookieLang());
  const dict = await fetchDictionary(lang);
  const t = makeT(dict);

  const post = await fetchBlogPost(slug);
  if (!post) notFound();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/blog" style={{ color: "#2563eb", textDecoration: "none", fontSize: 14 }}>{t("blog.back")}</a>
      </div>

      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 12, lineHeight: 1.3 }}>
        {post.title}
        <PageHelp text={t("help.blogPost")} />
      </h1>
      {post.updated_at && (
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 32 }}>
          {t("blog.publishedAt")} {formatDate(post.updated_at)}
        </div>
      )}

      <article
        style={{
          fontSize: 15,
          lineHeight: 1.9,
          color: "#334155",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {post.content}
      </article>

      <div style={{ marginTop: 48, borderTop: "1px solid #e2e8f0", paddingTop: 24 }}>
        <a href="/blog" style={{ color: "#2563eb", textDecoration: "none", fontSize: 14 }}>{t("blog.back")}</a>
      </div>
    </div>
  );
}

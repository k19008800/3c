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
    <div className="container" style={{ paddingTop: "var(--space-7xl)", paddingBottom: "var(--space-8xl)", maxWidth: "820px" }}>
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <a href="/blog" className="article-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          {t("blog.back")}
        </a>
      </div>

      <span className="overline">Article</span>
      <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.02em", color: "var(--color-text)", margin: "var(--space-sm) 0 var(--space-md)" }}>
        {post.title}
        <PageHelp text={t("help.blogPost")} />
      </h1>
      {post.updated_at && (
        <div className="blog-meta" style={{ marginBottom: "var(--space-3xl)" }}>
          <time dateTime={post.updated_at}>
            {t("blog.publishedAt")} {formatDate(post.updated_at)}
          </time>
        </div>
      )}

      <article className="article-body">{post.content}</article>

      <div style={{ marginTop: "var(--space-5xl)", borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-2xl)" }}>
        <a href="/blog" className="article-back">{t("blog.back")}</a>
      </div>
    </div>
  );
}

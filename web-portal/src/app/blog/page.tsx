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
    <div>
      <section className="page-hero">
        <div className="container anim-fade-in">
          <span className="overline">Blog</span>
          <h1>
            {t("blog.title")}
            <PageHelp text={t("help.blog")} />
          </h1>
          <p className="page-subtitle">{t("blog.subtitle")}</p>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: "var(--space-8xl)" }}>
        <div className="blog-list">
          {items.map((post, i) => (
            <a
              key={post.id}
              href={`/blog/${post.slug}`}
              className={`blog-card anim-fade-in-up anim-fade-in-up-d${(i % 4) + 1}`}
            >
              <h2>{post.title}</h2>
              {post.updated_at && (
                <div className="blog-meta">
                  <span>{t("blog.publishedAt")}</span>
                  <span className="dot-sep" />
                  <time dateTime={post.updated_at}>{formatDate(post.updated_at)}</time>
                </div>
              )}
            </a>
          ))}
        </div>

        {items.length === 0 && (
          <p className="empty-state">{t("blog.empty")}</p>
        )}
      </section>
    </div>
  );
}

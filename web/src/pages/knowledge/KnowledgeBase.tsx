import React, { useState, useEffect } from "react";
import api from "../../lib/api";

interface Category {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  articleCount: number;
}

interface Article {
  id: number;
  title: string;
  summary: string | null;
  categoryId: number | null;
  categoryName: string | null;
  tags: string | null;
  viewCount: number;
  helpfulCount: number;
  publishedAt: string | null;
}

export default function KnowledgeBase() {
  const [view, setView] = useState<"list" | "detail">("list");
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [currentArticle, setCurrentArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [helpfulLoading, setHelpfulLoading] = useState(false);

  useEffect(() => {
    api.get("/api/v1/knowledge/categories").then((res) => {
      if (res.data?.code === 0) setCategories(res.data.data.categories);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (view !== "list") return;
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterCategory) params.set("categoryId", filterCategory);
    params.set("page", String(page));
    params.set("limit", "20");
    api.get(`/api/v1/knowledge?${params}`).then((res) => {
      if (res.data?.code === 0) {
        setArticles(res.data.data.articles);
        setTotal(res.data.data.total);
        setTotalPages(res.data.data.totalPages);
      }
    }).finally(() => setLoading(false));
  }, [view, search, filterCategory, page]);

  const openArticle = async (id: number) => {
    try {
      const res = await api.get(`/api/v1/knowledge/${id}`);
      if (res.data?.code === 0) {
        setCurrentArticle(res.data.data.article);
        setView("detail");
      }
    } catch {}
  };

  const markHelpful = async () => {
    if (!currentArticle || helpfulLoading) return;
    setHelpfulLoading(true);
    try {
      await api.post(`/api/v1/knowledge/${currentArticle.id}/helpful`);
      setCurrentArticle({ ...currentArticle, helpfulCount: currentArticle.helpfulCount + 1 });
    } finally {
      setHelpfulLoading(false);
    }
  };

  if (view === "detail" && currentArticle) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => setView("list")} className="text-blue-600 hover:underline mb-4 flex items-center gap-1">
          &larr; 返回列表
        </button>
        <h1 className="text-2xl font-bold mb-2">{currentArticle.title}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
          <span>分类: {currentArticle.categoryName || "未分类"}</span>
          <span>阅读: {currentArticle.viewCount}</span>
          <span>有用: {currentArticle.helpfulCount}</span>
          {currentArticle.publishedAt && (
            <span>发布: {new Date(currentArticle.publishedAt).toLocaleDateString()}</span>
          )}
        </div>
        {currentArticle.tags && (
          <div className="flex gap-2 mb-4">
            {currentArticle.tags.split(",").map((tag: string, i: number) => (
              <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{tag.trim()}</span>
            ))}
          </div>
        )}
        <article
          className="prose max-w-none border-t pt-4"
          dangerouslySetInnerHTML={{ __html: currentArticle.content }}
        />
        <div className="mt-8 flex items-center gap-2 text-sm text-gray-500">
          <span>这篇文章对你有帮助吗？</span>
          <button onClick={markHelpful} disabled={helpfulLoading}
            className="px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50">
            有用 ({currentArticle.helpfulCount})
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">知识库</h1>

      <div className="flex gap-3 mb-6 flex-wrap">
        <input type="text" placeholder="搜索文章..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 w-72" />
        <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5">
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.articleCount})</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 self-center">共 {total} 篇文章</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : articles.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无文章</div>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => (
            <div key={a.id} onClick={() => openArticle(a.id)}
              className="border rounded-lg p-4 hover:border-blue-300 hover:shadow-sm cursor-pointer transition">
              <h2 className="font-semibold text-lg mb-1">{a.title}</h2>
              <p className="text-sm text-gray-500 mb-2">{a.summary || "暂无摘要"}</p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {a.categoryName && <span>{a.categoryName}</span>}
                {a.tags && a.tags.split(",").map((tag: string, i: number) => (
                  <span key={i} className="px-1.5 py-0.5 bg-gray-100 rounded">{tag.trim()}</span>
                ))}
                <span>{a.viewCount} 阅读</span>
                <span>{a.helpfulCount} 有用</span>
                {a.publishedAt && <span>{new Date(a.publishedAt).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="px-3 py-1 border rounded disabled:opacity-30">上一页</button>
          <span className="px-3 py-1">{page}/{totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            className="px-3 py-1 border rounded disabled:opacity-30">下一页</button>
        </div>
      )}
    </div>
  );
}
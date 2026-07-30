import React, { useState, useEffect, useCallback } from "react";
import api from "../../../lib/api";

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  articleCount: number;
}

interface Article {
  id: number;
  title: string;
  summary: string | null;
  categoryId: number | null;
  categoryName: string | null;
  status: "draft" | "published";
  tags: string | null;
  viewCount: number;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export default function AdminKnowledgeBase() {
  const [activeTab, setActiveTab] = useState<"articles" | "categories">("articles");
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", description: "", sortOrder: 0 });

  const [showArticleModal, setShowArticleModal] = useState(false);
  const [articleForm, setArticleForm] = useState({
    title: "", content: "", summary: "", categoryId: "", tags: "", status: "draft" as "draft" | "published",
  });
  const [editingArticleId, setEditingArticleId] = useState<number | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterStatus) params.set("status", filterStatus);
      if (filterCategory) params.set("categoryId", filterCategory);
      params.set("page", String(page));
      params.set("limit", "20");
      const res = await api.get(`/api/v1/admin/knowledge?${params}`);
      if (res.data?.code === 0) {
        setArticles(res.data.data.articles);
        setTotal(res.data.data.total);
        setTotalPages(res.data.data.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterCategory, page]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/admin/knowledge/categories");
      if (res.data?.code === 0) setCategories(res.data.data.categories);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab === "articles") fetchArticles();
    else fetchCategories();
  }, [activeTab, fetchArticles, fetchCategories]);

  // ── 分类操作 ──
  const handleCreateCategory = async () => {
    if (!categoryForm.name || !categoryForm.slug) return;
    await api.post("/api/v1/admin/knowledge/categories", categoryForm);
    setShowCategoryModal(false);
    setCategoryForm({ name: "", slug: "", description: "", sortOrder: 0 });
    fetchCategories();
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm("确定删除该分类？")) return;
    await api.delete(`/api/v1/admin/knowledge/categories/${id}`);
    fetchCategories();
  };

  // ── 文章操作 ──
  const handleSaveArticle = async () => {
    if (!articleForm.title || !articleForm.content) return;
    const payload = {
      ...articleForm,
      categoryId: articleForm.categoryId ? Number(articleForm.categoryId) : null,
    };
    if (editingArticleId) {
      await api.put(`/api/v1/admin/knowledge/${editingArticleId}`, payload);
    } else {
      await api.post("/api/v1/admin/knowledge", payload);
    }
    setShowArticleModal(false);
    resetArticleForm();
    fetchArticles();
  };

  const handleEditArticle = async (id: number) => {
    try {
      const res = await api.get(`/api/v1/admin/knowledge/${id}`);
      if (res.data?.code === 0) {
        const a = res.data.data.article;
        setArticleForm({
          title: a.title, content: a.content, summary: a.summary || "",
          categoryId: a.categoryId ? String(a.categoryId) : "", tags: a.tags || "",
          status: a.status,
        });
        setEditingArticleId(id);
        setShowArticleModal(true);
      }
    } catch {}
  };

  const handlePublish = async (id: number, status: "draft" | "published") => {
    await api.post(`/api/v1/admin/knowledge/${id}/publish`, { status });
    fetchArticles();
  };

  const handleDeleteArticle = async (id: number) => {
    if (!confirm("确定删除该文章？")) return;
    await api.delete(`/api/v1/admin/knowledge/${id}`);
    fetchArticles();
  };

  const resetArticleForm = () => {
    setArticleForm({ title: "", content: "", summary: "", categoryId: "", tags: "", status: "draft" });
    setEditingArticleId(null);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">知识库管理</h1>
        <div className="flex gap-2">
          {activeTab === "articles" && (
            <button onClick={() => { resetArticleForm(); setShowArticleModal(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              新建文章
            </button>
          )}
          {activeTab === "categories" && (
            <button onClick={() => setShowCategoryModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              新建分类
            </button>
          )}
        </div>
      </div>

      {/* Tab */}
      <div className="flex border-b mb-4">
        <button onClick={() => setActiveTab("articles")}
          className={`px-4 py-2 ${activeTab === "articles" ? "border-b-2 border-blue-600 text-blue-600 font-medium" : "text-gray-500"}`}>
          文章管理
        </button>
        <button onClick={() => setActiveTab("categories")}
          className={`px-4 py-2 ${activeTab === "categories" ? "border-b-2 border-blue-600 text-blue-600 font-medium" : "text-gray-500"}`}>
          分类管理
        </button>
      </div>

      {/* ──── 文章管理 ──── */}
      {activeTab === "articles" && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap">
            <input type="text" placeholder="搜索标题/标签..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="border rounded px-3 py-1.5 w-60" />
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="border rounded px-3 py-1.5">
              <option value="">全部状态</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
            </select>
            <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
              className="border rounded px-3 py-1.5">
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500 self-center">共 {total} 条</span>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400">加载中...</div>
          ) : articles.length === 0 ? (
            <div className="text-center py-8 text-gray-400">暂无文章</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2 border">标题</th>
                  <th className="px-4 py-2 border">分类</th>
                  <th className="px-4 py-2 border">状态</th>
                  <th className="px-4 py-2 border">阅读</th>
                  <th className="px-4 py-2 border">有用</th>
                  <th className="px-4 py-2 border">更新时间</th>
                  <th className="px-4 py-2 border">操作</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border">{a.title}</td>
                    <td className="px-4 py-2 border text-sm text-gray-500">{a.categoryName || "-"}</td>
                    <td className="px-4 py-2 border">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        a.status === "published" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {a.status === "published" ? "已发布" : "草稿"}
                      </span>
                    </td>
                    <td className="px-4 py-2 border text-sm">{a.viewCount}</td>
                    <td className="px-4 py-2 border text-sm">{a.helpfulCount}</td>
                    <td className="px-4 py-2 border text-sm text-gray-500">
                      {new Date(a.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 border">
                      <div className="flex gap-1">
                        <button onClick={() => handleEditArticle(a.id)}
                          className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">编辑</button>
                        {a.status === "draft" ? (
                          <button onClick={() => handlePublish(a.id, "published")}
                            className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600">发布</button>
                        ) : (
                          <button onClick={() => handlePublish(a.id, "draft")}
                            className="text-xs px-2 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600">下架</button>
                        )}
                        <button onClick={() => handleDeleteArticle(a.id)}
                          className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600">删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                className="px-3 py-1 border rounded disabled:opacity-30">上一页</button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
                className="px-3 py-1 border rounded disabled:opacity-30">下一页</button>
            </div>
          )}
        </div>
      )}

      {/* ──── 分类管理 ──── */}
      {activeTab === "categories" && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2 border">名称</th>
              <th className="px-4 py-2 border">别名</th>
              <th className="px-4 py-2 border">说明</th>
              <th className="px-4 py-2 border">排序</th>
              <th className="px-4 py-2 border">文章数</th>
              <th className="px-4 py-2 border">操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无分类</td></tr>
            ) : categories.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border font-medium">{c.name}</td>
                <td className="px-4 py-2 border text-sm text-gray-500">{c.slug}</td>
                <td className="px-4 py-2 border text-sm text-gray-500">{c.description || "-"}</td>
                <td className="px-4 py-2 border text-sm">{c.sortOrder}</td>
                <td className="px-4 py-2 border text-sm">{c.articleCount}</td>
                <td className="px-4 py-2 border">
                  <button onClick={() => handleDeleteCategory(c.id)}
                    className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── 分类 Modal ── */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowCategoryModal(false)}>
          <div className="bg-white rounded-lg p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">新建分类</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">名称</label>
                <input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full border rounded px-3 py-1.5" />
              </div>
              <div>
                <label className="block text-sm mb-1">别名 (slug)</label>
                <input value={categoryForm.slug} onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                  className="w-full border rounded px-3 py-1.5" />
              </div>
              <div>
                <label className="block text-sm mb-1">说明</label>
                <input value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className="w-full border rounded px-3 py-1.5" />
              </div>
              <div>
                <label className="block text-sm mb-1">排序</label>
                <input type="number" value={categoryForm.sortOrder} onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-1.5" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50">取消</button>
              <button onClick={handleCreateCategory}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 文章编辑 Modal ── */}
      {showArticleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => { setShowArticleModal(false); resetArticleForm(); }}>
          <div className="bg-white rounded-lg p-6 w-[700px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editingArticleId ? "编辑文章" : "新建文章"}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">标题</label>
                <input value={articleForm.title} onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
                  className="w-full border rounded px-3 py-1.5" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm mb-1">分类</label>
                  <select value={articleForm.categoryId}
                    onChange={(e) => setArticleForm({ ...articleForm, categoryId: e.target.value })}
                    className="w-full border rounded px-3 py-1.5">
                    <option value="">无分类</option>
                    {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm mb-1">标签 (逗号分隔)</label>
                  <input value={articleForm.tags}
                    onChange={(e) => setArticleForm({ ...articleForm, tags: e.target.value })}
                    className="w-full border rounded px-3 py-1.5" />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">摘要</label>
                <textarea value={articleForm.summary} rows={2}
                  onChange={(e) => setArticleForm({ ...articleForm, summary: e.target.value })}
                  className="w-full border rounded px-3 py-1.5" />
              </div>
              <div>
                <label className="block text-sm mb-1">内容 (支持 HTML)</label>
                <textarea value={articleForm.content} rows={12}
                  onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-sm mb-1">状态</label>
                <select value={articleForm.status}
                  onChange={(e) => setArticleForm({ ...articleForm, status: e.target.value as any })}
                  className="border rounded px-3 py-1.5">
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowArticleModal(false); resetArticleForm(); }}
                className="px-4 py-2 border rounded hover:bg-gray-50">取消</button>
              <button onClick={handleSaveArticle}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                {editingArticleId ? "保存" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
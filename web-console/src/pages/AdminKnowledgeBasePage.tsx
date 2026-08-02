import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 管理端 — 知识库文章管理
 * 对齐 docs/ref-10.2-knowledge-base.md
 */

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const iconHelp = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;

const STATS_HELP = "管理端知识库：管理已发布/草稿/归档的文章，可创建编辑和删除。分类管理。点击[?]查看详情。";

export default function AdminKnowledgeBasePage() {
  const [help, setHelp] = useState("");
  const [tab, setTab] = useState<"articles" | "categories" | "templates">("articles");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // —— 文章编辑弹窗 ——
  const [editArticle, setEditArticle] = useState<any>(null);
  const [editForm, setEditForm] = useState({ title: "", category: "", content: "", tags: "", status: "draft" });

  // —— 分类管理弹窗 ——
  const [editCat, setEditCat] = useState<any>(null);
  const [catForm, setCatForm] = useState({ name: "", slug: "", description: "", sort_order: 0 });

  // —— 快捷回复模板弹窗 ——
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [tplForm, setTplForm] = useState({ name: "", category: "", content: "", sort_order: 0 });

  // 查询：文章
  const listQ = useQuery({
    queryKey: ["admin/knowledge-base", statusFilter, search],
    queryFn: () =>
      api.get("/admin/knowledge-base", { params: { status: statusFilter || undefined, search: search || undefined, limit: 50, offset: 0 } }).then((r) => r.data.data),
  });

  // 查询：分类
  const catsQ = useQuery({
    queryKey: ["admin/knowledge-base/categories"],
    queryFn: () => api.get("/admin/knowledge-base/categories").then((r) => r.data.data),
  });

  // 查询：快捷回复
  const tplsQ = useQuery({
    queryKey: ["admin/quick-replies"],
    queryFn: () => api.get("/admin/quick-replies").then((r) => r.data.data),
  });

  // —— 创建/更新文章 ——
  const saveArticleMut = useMutation({
    mutationFn: () => {
      const body = { ...editForm };
      if (editArticle) return api.put(`/admin/knowledge-base/${editArticle.id}`, body);
      return api.post("/admin/knowledge-base", body);
    },
    onSuccess: () => {
      setNotice({ type: "success", msg: editArticle ? "文章已更新" : "文章已创建" });
      setEditArticle(null);
      qc.invalidateQueries({ queryKey: ["admin/knowledge-base"] });
    },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  // —— 删除文章 ——
  const delArticleMut = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/knowledge-base/${id}`),
    onSuccess: () => { setNotice({ type: "success", msg: "文章已删除" }); qc.invalidateQueries({ queryKey: ["admin/knowledge-base"] }); },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  // —— 创建/更新分类 ——
  const saveCatMut = useMutation({
    mutationFn: () => {
      if (editCat) return api.put(`/admin/knowledge-base/categories/${editCat.id}`, catForm);
      return api.post("/admin/knowledge-base/categories", catForm);
    },
    onSuccess: () => { setNotice({ type: "success", msg: editCat ? "分类已更新" : "分类已创建" }); setEditCat(null); qc.invalidateQueries({ queryKey: ["admin/knowledge-base/categories"] }); },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  // —— 删除分类 ——
  const delCatMut = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/knowledge-base/categories/${id}`),
    onSuccess: () => { setNotice({ type: "success", msg: "分类已删除" }); qc.invalidateQueries({ queryKey: ["admin/knowledge-base/categories"] }); },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  // —— 创建/更新模板 ——
  const saveTplMut = useMutation({
    mutationFn: () => {
      if (editTemplate) return api.put(`/admin/quick-replies/${editTemplate.id}`, tplForm);
      return api.post("/admin/quick-replies", tplForm);
    },
    onSuccess: () => { setNotice({ type: "success", msg: editTemplate ? "模板已更新" : "模板已创建" }); setEditTemplate(null); qc.invalidateQueries({ queryKey: ["admin/quick-replies"] }); },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  // —— 删除模板 ——
  const delTplMut = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/quick-replies/${id}`),
    onSuccess: () => { setNotice({ type: "success", msg: "模板已删除" }); qc.invalidateQueries({ queryKey: ["admin/quick-replies"] }); },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  const articles = listQ.data?.list ?? [];
  const total = listQ.data?.total ?? 0;
  const cats = catsQ.data?.list ?? [];
  const tpls = tplsQ.data?.list ?? [];

  const statusLabel = (s: string) => ({ draft: "草稿", published: "已发布", archived: "已归档" }[s] ?? s);

  // ─── 弹窗：编辑文章 ───
  const ArticleDialog = () => (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setEditArticle(null)}>
      <div style={{ ...card, width: 560, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px" }}>{editArticle ? "编辑文章" : "新建文章"}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>标题 *</label>
            <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>分类</label>
              <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }}>
                <option value="">无</option>
                {cats.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>标签（逗号分隔）</label>
              <input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>内容</label>
            <textarea value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} rows={10} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, fontFamily: "monospace" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>状态</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }}>
              <option value="draft">草稿</option>
              <option value="published">发布</option>
              <option value="archived">归档</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
          <button onClick={() => setEditArticle(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>取消</button>
          <button onClick={() => saveArticleMut.mutate()} disabled={saveArticleMut.isPending} style={{ ...btnBase, background: "#2563eb", color: "#fff", opacity: saveArticleMut.isPending ? 0.6 : 1 }}>{saveArticleMut.isPending ? "保存中..." : "保存"}</button>
        </div>
      </div>
    </div>
  );

  // ─── 弹窗：编辑分类 ───
  const CatDialog = () => (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setEditCat(null)}>
      <div style={{ ...card, width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px" }}>{editCat ? "编辑分类" : "新建分类"}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>名称 *</label>
            <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>别名（slug）*</label>
            <input value={catForm.slug} onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>描述</label>
            <input value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>排序</label>
            <input type="number" value={catForm.sort_order} onChange={(e) => setCatForm({ ...catForm, sort_order: Number(e.target.value) })} style={{ width: 100, padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
          <button onClick={() => setEditCat(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>取消</button>
          <button onClick={() => saveCatMut.mutate()} disabled={saveCatMut.isPending} style={{ ...btnBase, background: "#2563eb", color: "#fff", opacity: saveCatMut.isPending ? 0.6 : 1 }}>{saveCatMut.isPending ? "保存中..." : "保存"}</button>
        </div>
      </div>
    </div>
  );

  // ─── 弹窗：编辑模板 ───
  const TplDialog = () => (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setEditTemplate(null)}>
      <div style={{ ...card, width: 480 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px" }}>{editTemplate ? "编辑模板" : "新建模板"}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>名称 *</label>
            <input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>分类</label>
            <select value={tplForm.category} onChange={(e) => setTplForm({ ...tplForm, category: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 }}>
              <option value="">通用</option>
              <option value="greeting">问候</option>
              <option value="billing">计费</option>
              <option value="tech">技术</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>内容 *</label>
            <textarea value={tplForm.content} onChange={(e) => setTplForm({ ...tplForm, content: e.target.value })} rows={6} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, fontFamily: "monospace" }} />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>支持变量：{`{username}`} {`{balance}`} {`{api_key}`} </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
          <button onClick={() => setEditTemplate(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>取消</button>
          <button onClick={() => saveTplMut.mutate()} disabled={saveTplMut.isPending} style={{ ...btnBase, background: "#2563eb", color: "#fff", opacity: saveTplMut.isPending ? 0.6 : 1 }}>{saveTplMut.isPending ? "保存中..." : "保存"}</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        客服支撑 <span onClick={() => setHelp(STATS_HELP)} style={iconHelp} title="帮助">[?]</span>
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>知识库 · 分类 · 快捷回复模板管理</p>

      {notice && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, background: notice.type === "success" ? "#d1fae5" : "#fee2e2", color: notice.type === "success" ? "#065f46" : "#991b1b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit" }}>×</button>
        </div>
      )}

      {/* Tab 切换 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { key: "articles" as const, label: "文章管理" },
          { key: "categories" as const, label: "分类管理" },
          { key: "templates" as const, label: "快捷回复" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ ...btnBase, background: tab === t.key ? "#2563eb" : "#fff", color: tab === t.key ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>{t.label}</button>
        ))}
      </div>

      {/* ────────── 文章列表 ────────── */}
      {tab === "articles" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索文章标题或标签..." style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, maxWidth: 320 }} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}>
              <option value="">全部状态</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="archived">已归档</option>
            </select>
            <button onClick={() => { setEditArticle({}); setEditForm({ title: "", category: "", content: "", tags: "", status: "draft" }); }} style={{ ...btnBase, background: "#059669", color: "#fff" }}>+ 新建文章 <span onClick={(e) => { e.stopPropagation(); setHelp("新建一篇知识库文章并选择状态"); }} style={iconHelp}>[?]</span></button>
          </div>

          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {listQ.isLoading ? (
              <p style={{ padding: 20, color: "#94a3b8" }}>加载中...</p>
            ) : articles.length === 0 ? (
              <p style={{ padding: 20, color: "#94a3b8" }}>暂无文章。点击"新建文章"创建第一篇。</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>标题</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>分类</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>状态</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>浏览</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>有帮助</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>作者</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>更新</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a: any, i: number) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 16px", color: "#334155", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>{a.category ?? "-"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: a.status === "published" ? "#dcfce7" : a.status === "draft" ? "#fef3c7" : "#f1f5f9", color: a.status === "published" ? "#166534" : a.status === "draft" ? "#92400e" : "#475569" }}>{statusLabel(a.status)}</span>
                      </td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>{a.view_count ?? 0}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>{a.helpful_count ?? 0}/{a.unhelpful_count ?? 0}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>{a.author_name ?? "-"}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>{a.updated_at ? new Date(a.updated_at).toLocaleDateString("zh-CN") : "-"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => { setEditArticle(a); setEditForm({ title: a.title, category: a.category ?? "", content: a.content ?? "", tags: a.tags ?? "", status: a.status }); }} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", fontSize: 12 }}>编辑</button>
                          <button onClick={() => { if (confirm("确认删除？")) delArticleMut.mutate(a.id); }} style={{ ...btnBase, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", fontSize: 12 }}>删除 <span onClick={(e) => { e.stopPropagation(); setHelp("删除后不可恢复"); }} style={iconHelp}>[?]</span></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {editArticle !== null && <ArticleDialog />}
        </>
      )}

      {/* ────────── 分类管理 ────────── */}
      {tab === "categories" && (
        <>
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => { setEditCat({}); setCatForm({ name: "", slug: "", description: "", sort_order: 0 }); }} style={{ ...btnBase, background: "#059669", color: "#fff" }}>+ 新建分类</button>
          </div>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {cats.length === 0 ? (
              <p style={{ padding: 20, color: "#94a3b8" }}>暂无分类。</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>名称</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>别名</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>描述</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>排序</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c: any, i: number) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 16px", color: "#334155" }}>{c.name}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>{c.slug}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>{c.description ?? "-"}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>{c.sort_order}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => { setEditCat(c); setCatForm({ name: c.name, slug: c.slug, description: c.description ?? "", sort_order: c.sort_order }); }} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", fontSize: 12 }}>编辑</button>
                          <button onClick={() => { if (confirm("删除此分类？已有文章的分类不会删除。")) delCatMut.mutate(c.id); }} style={{ ...btnBase, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", fontSize: 12 }}>删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {editCat !== null && <CatDialog />}
        </>
      )}

      {/* ────────── 快捷回复模板 ────────── */}
      {tab === "templates" && (
        <>
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => { setEditTemplate({}); setTplForm({ name: "", category: "", content: "", sort_order: 0 }); }} style={{ ...btnBase, background: "#059669", color: "#fff" }}>+ 新建模板</button>
          </div>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {tpls.length === 0 ? (
              <p style={{ padding: 20, color: "#94a3b8" }}>暂无快捷回复模板。</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>名称</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>分类</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>内容</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>创建者</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tpls.map((tpl: any, i: number) => (
                    <tr key={tpl.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 16px", color: "#334155" }}>{tpl.name}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>{tpl.category ?? "通用"}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tpl.content}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>{tpl.created_by_name ?? "-"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => { setEditTemplate(tpl); setTplForm({ name: tpl.name, category: tpl.category ?? "", content: tpl.content, sort_order: tpl.sort_order }); }} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", fontSize: 12 }}>编辑</button>
                          <button onClick={() => { if (confirm("确认删除？")) delTplMut.mutate(tpl.id); }} style={{ ...btnBase, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", fontSize: 12 }}>删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {editTemplate !== null && <TplDialog />}
        </>
      )}

      {help && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setHelp("")}>
          <div style={{ ...card, width: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>帮助说明</h3>
            <p style={{ color: "#475569", lineHeight: 1.7, margin: 0, fontSize: 14 }}>{help}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setHelp("")} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

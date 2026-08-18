import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast, ConfirmPopover, Pagination } from "@3cloud/shared-ui";

/**
 * 管理端 — 知识库文章管理
 * 数据来自真实后端 /admin/knowledge-base（列表/创建/更新/删除）。
 * 对齐 docs/ref-10.2-knowledge-base.md
 */

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminKnowledgeBasePage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const qc = useQueryClient();

  // —— 文章编辑弹窗 ——
  const [editArticle, setEditArticle] = useState<any>(null);
  const [editForm, setEditForm] = useState({ title: "", category: "", content: "", status: "draft" });

  // 查询：文章（keyword 搜索 + 分页）
  const listQ = useQuery({
    queryKey: ["admin/knowledge-base", keyword, page, pageSize],
    queryFn: async () => (await api.get<{ data: { list: any[]; total: number; page: number; pageSize: number } }>("/admin/knowledge-base", {
      params: { keyword: keyword || undefined, page, pageSize },
    })).data.data,
    retry: 0,
  });
  const articles = listQ.data?.list ?? [];

  // —— 创建/更新文章 ——
  const saveArticleMut = useMutation({
    mutationFn: () => {
      const body = { ...editForm };
      if (editArticle) return api.put(`/admin/knowledge-base/${editArticle.id}`, body);
      return api.post("/admin/knowledge-base", body);
    },
    onSuccess: () => {
      toast.success(editArticle ? "文章已更新" : "文章已创建");
      setEditArticle(null);
      qc.invalidateQueries({ queryKey: ["admin/knowledge-base"] });
    },
    onError: (err: any) => toast.error(extractError(err)),
  });

  // —— 删除文章 ——
  const delArticleMut = useMutation<any, unknown, number>({
    mutationFn: (id: number) => api.delete(`/admin/knowledge-base/${id}`),
    onSuccess: () => { toast.success("文章已删除"); qc.invalidateQueries({ queryKey: ["admin/knowledge-base"] }); },
    onError: (err: any) => toast.error(extractError(err)),
  });

  const statusLabel = (s: string) => ({ draft: "草稿", published: "已发布", archived: "已归档" }[s] ?? s);
  const articleStatus = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
    if (s === "published") return "success";
    if (s === "draft") return "warning";
    return "default";
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        客服支撑
        <HelpIcon text="管理端知识库：管理已发布/草稿文章，可创建、编辑、删除与关键词搜索。" level="page" />
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>知识库文章管理</p>

      {/* ────────── 文章列表 ────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setKeyword(search.trim()); setPage(1); } }}
          placeholder="搜索文章标题/分类/内容，回车确认..."
          style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 14, maxWidth: 360 }}
        />
        <button onClick={() => { setKeyword(search.trim()); setPage(1); }} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", border: `1px solid var(--color-border)` }}>搜索</button>
        <button onClick={() => { setEditArticle({}); setEditForm({ title: "", category: "", content: "", status: "draft" }); }} style={{ ...btnBase, background: "#059669", color: "#fff", marginLeft: "auto" }}>
          + 新建文章
          <HelpIcon text="新建一篇知识库文章并选择状态" />
        </button>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {listQ.isLoading ? (
          <p style={{ padding: 20, color: "#94a3b8" }}>加载中...</p>
        ) : listQ.isError ? (
          <p style={{ padding: 20, color: "var(--color-danger-text)" }}>加载失败：{extractError(listQ.error)}</p>
        ) : articles.length === 0 ? (
          <p style={{ padding: 20, color: "#94a3b8" }}>暂无文章。点击"新建文章"创建第一篇。</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--color-bg)", borderBottom: `1px solid var(--color-border)` }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>ID</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>标题</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>分类</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>状态</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>内容预览</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>更新</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a: any, i: number) => (
                <tr key={a.id} style={{ borderBottom: `1px solid var(--color-border)`, background: i % 2 === 0 ? "var(--color-panel)" : "#fafafa" }}>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)", fontSize: 12 }}>#{a.id}</td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)", fontSize: 12 }}>{a.category ?? "-"}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <StatusBadge status={articleStatus(a.status)}>{statusLabel(a.status)}</StatusBadge>
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)", fontSize: 12, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.content ?? ""}</td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)", fontSize: 12 }}>{a.updated_at ? new Date(a.updated_at).toLocaleString("zh-CN") : "-"}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { setEditArticle(a); setEditForm({ title: a.title, category: a.category ?? "", content: a.content ?? "", status: a.status }); }} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", border: `1px solid var(--color-border)`, fontSize: 12 }}>编辑</button>
                      <ConfirmPopover title="确认删除？" description="删除后不可恢复" onConfirm={() => delArticleMut.mutate(a.id)}>
                        <button style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", border: `1px solid #fca5a5`, fontSize: 12 }}>删除</button>
                      </ConfirmPopover>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {listQ.data && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <Pagination
            current={page}
            total={listQ.data.total}
            pageSize={pageSize}
            onChange={(p, size) => { setPage(p); setPageSize(size); }}
          />
        </div>
      )}

      {/* 文章编辑 Modal */}
      <Modal open={editArticle !== null} onClose={() => setEditArticle(null)} title={editArticle ? "编辑文章" : "新建文章"} width={560}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>标题 *</label>
            <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>分类</label>
            <input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} placeholder="如：充值 / 开发 / 技术" style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>内容 *</label>
            <textarea value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} rows={10} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 14, fontFamily: "monospace" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>状态</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 14 }}>
              <option value="draft">草稿</option>
              <option value="published">发布</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={() => { saveArticleMut.mutate(); }} disabled={saveArticleMut.isPending || !editForm.title || !editForm.content} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", opacity: saveArticleMut.isPending ? 0.6 : 1 }}>{saveArticleMut.isPending ? "保存中..." : "保存"}</button>
        </div>
      </Modal>
    </div>
  );
}

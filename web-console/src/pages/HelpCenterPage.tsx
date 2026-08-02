import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * 用户端 — 帮助中心
 * 对齐 docs/ref-10.3-help-center.md
 */

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const icon = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;
const PAGE_HELP = "帮助中心：浏览常见问题和知识库文章，搜索关键词查找答案，对文章反馈是否有帮助。";

export default function HelpCenterPage() {
  const [help, setHelp] = useState("");
  const [search, setSearch] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [helpfulVote, setHelpfulVote] = useState<boolean | null>(null);

  const listQ = useQuery({
    queryKey: ["me/knowledge-base", search],
    queryFn: () => api.get("/me/knowledge-base", { params: { search: search || undefined, limit: 50 } }).then((r) => r.data.data),
  });

  const catsQ = useQuery({
    queryKey: ["me/knowledge-base/categories"],
    queryFn: () => api.get("/me/knowledge-base/categories").then((r) => r.data.data),
  });

  const feedbackMut = useMutation({
    mutationFn: ({ articleId, helpful }: { articleId: number; helpful: boolean }) =>
      api.post(`/me/knowledge-base/${articleId}/feedback`, { helpful }),
    onSuccess: () => setHelpfulVote(null),
  });

  const articles = listQ.data?.list ?? [];
  const cats = catsQ.data?.list ?? [];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 4 }}>
        帮助中心 <span onClick={() => setHelp(PAGE_HELP)} style={icon} title="帮助">[?]</span>
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13, marginBottom: 24 }}>常见问题 · 操作指南 · 自助解决问题</p>

      {/* 搜索 */}
      <div style={{ marginBottom: 24 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索文章标题、标签或内容..."
          style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, boxSizing: "border-box" }}
        />
      </div>

      {selectedArticle ? (
        // ─── 文章详情 ───
        <div>
          <button onClick={() => { setSelectedArticle(null); setHelpfulVote(null); }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 16, display: "block" }}>← 返回列表</button>
          <div style={{ ...card }}>
            <h3 style={{ margin: "0 0 8px" }}>{selectedArticle.title}</h3>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
              {selectedArticle.category && <span style={{ marginRight: 12 }}>{selectedArticle.category}</span>}
              浏览 {selectedArticle.view_count ?? 0} 次
          </div>
            <div style={{ lineHeight: 1.8, fontSize: 14, color: "#334155", whiteSpace: "pre-wrap" }}>{selectedArticle.content ?? "暂无内容"}</div>

            {/* 反馈 */}
            <div style={{ marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 16, display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#64748b" }}>
              <span>这篇文章对您有帮助吗？</span>
              <button onClick={() => { feedbackMut.mutate({ articleId: selectedArticle.id, helpful: true }); setHelpfulVote(true); }} style={{ background: helpfulVote === true ? "#d1fae5" : "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>有帮助（{selectedArticle.helpful_count ?? 0}）</button>
              <button onClick={() => { feedbackMut.mutate({ articleId: selectedArticle.id, helpful: false }); setHelpfulVote(false); }} style={{ background: helpfulVote === false ? "#fee2e2" : "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>无帮助（{selectedArticle.unhelpful_count ?? 0}）</button>
            </div>
          </div>
        </div>
      ) : (
        // ─── 列表视图 ───
        <>
          {/* 分类导航 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <button onClick={() => setSearch("")} style={{ padding: "6px 12px", borderRadius: 6, background: !search ? "#2563eb" : "#fff", color: !search ? "#fff" : "#475569", border: "1px solid #cbd5e1", cursor: "pointer", fontSize: 13 }}>全部</button>
            {cats.map((c: any) => (
              <button key={c.id} onClick={() => setSearch(c.name)} style={{ padding: "6px 12px", borderRadius: 6, background: search === c.name ? "#2563eb" : "#fff", color: search === c.name ? "#fff" : "#475569", border: "1px solid #cbd5e1", cursor: "pointer", fontSize: 13 }}>{c.name}</button>
            ))}
          </div>

          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {listQ.isLoading ? (
              <p style={{ padding: 20, color: "#94a3b8" }}>加载中...</p>
            ) : articles.length === 0 ? (
              <p style={{ padding: 20, color: "#94a3b8" }}>暂无帮助文章。</p>
            ) : (
              <div>
                {articles.map((a: any) => (
                  <div key={a.id} onClick={() => setSelectedArticle(a)} style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", cursor: "pointer", transition: "background .15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 15, color: "#1e293b", marginBottom: 4 }}>{a.title}</div>
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>
                          {a.category && <span style={{ marginRight: 12 }}>{a.category}</span>}
                          {a.tags && a.tags.split(",").map((t: string) => <span key={t} style={{ marginRight: 6, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{t.trim()}</span>)}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", gap: 8 }}>
                        <span>浏览 {a.view_count ?? 0}</span>
                        <span>有帮助 {a.helpful_count ?? 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {help && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setHelp("")}>
          <div style={{ ...card, width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>帮助</h3>
            <p style={{ color: "#475569", lineHeight: 1.7, margin: 0 }}>{help}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setHelp("")} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, background: "#f1f5f9", color: "#334155" }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

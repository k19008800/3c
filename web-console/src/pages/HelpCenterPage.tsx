import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  HelpIcon,
  SkeletonGroup,
  EmptyState,
  SearchBar,
  useToast,
} from "@3cloud/shared-ui";

/**
 * 用户端 — 帮助中心
 * 对齐 docs/ref-10.3-help-center.md
 */

const card: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
};

export default function HelpCenterPage() {
  const [search, setSearch] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [helpfulVote, setHelpfulVote] = useState<boolean | null>(null);
  const { toast } = useToast();

  const listQ = useQuery({
    queryKey: ["me/knowledge-base", search],
    queryFn: () =>
      api
        .get("/me/knowledge-base", {
          params: { search: search || undefined, limit: 50 },
        })
        .then((r) => r.data.data),
  });

  const catsQ = useQuery({
    queryKey: ["me/knowledge-base/categories"],
    queryFn: () =>
      api.get("/me/knowledge-base/categories").then((r) => r.data.data),
  });

  const feedbackMut = useMutation({
    mutationFn: ({
      articleId,
      helpful,
    }: {
      articleId: number;
      helpful: boolean;
    }) => api.post(`/me/knowledge-base/${articleId}/feedback`, { helpful }),
    onSuccess: () => {
      toast.success("感谢您的反馈");
      setHelpfulVote(null);
    },
  });

  const articles = listQ.data?.list ?? [];
  const cats = catsQ.data?.list ?? [];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 4 }}>
        帮助中心
        <HelpIcon
          text="帮助中心：浏览常见问题和知识库文章，搜索关键词查找答案，对文章反馈是否有帮助。"
          level="page"
        />
      </h2>
      <p
        style={{
          color: "var(--color-text-secondary)",
          marginTop: 0,
          fontSize: 13,
          marginBottom: 24,
        }}
      >
        常见问题 · 操作指南 · 自助解决问题
      </p>

      {/* 搜索 */}
      <div style={{ marginBottom: 24 }}>
        <SearchBar
          placeholder="搜索文章标题、标签或内容..."
          value={search}
          onChange={setSearch}
          onSearch={setSearch}
        />
      </div>

      {selectedArticle ? (
        // ─── 文章详情 ───
        <div>
          <button
            onClick={() => {
              setSelectedArticle(null);
              setHelpfulVote(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-primary)",
              cursor: "pointer",
              fontSize: 13,
              padding: 0,
              marginBottom: 16,
              display: "block",
            }}
          >
            ← 返回列表
          </button>
          <div style={{ ...card }}>
            <h3 style={{ margin: "0 0 8px" }}>{selectedArticle.title}</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
              {selectedArticle.category && (
                <span style={{ marginRight: 12 }}>{selectedArticle.category}</span>
              )}
              浏览 {selectedArticle.view_count ?? 0} 次
            </div>
            <div
              style={{
                lineHeight: 1.8,
                fontSize: 14,
                color: "var(--color-text)",
                whiteSpace: "pre-wrap",
              }}
            >
              {selectedArticle.content ?? "暂无内容"}
            </div>

            {/* 反馈 */}
            <div
              style={{
                marginTop: 24,
                borderTop: "1px solid var(--color-border)",
                paddingTop: 16,
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 13,
                color: "var(--color-text-secondary)",
              }}
            >
              <span>这篇文章对您有帮助吗？</span>
              <button
                onClick={() => {
                  feedbackMut.mutate({
                    articleId: selectedArticle.id,
                    helpful: true,
                  });
                  setHelpfulVote(true);
                }}
                style={{
                  background:
                    helpfulVote === true ? "var(--color-success-bg)" : "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  padding: "6px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                有帮助（{selectedArticle.helpful_count ?? 0}）
              </button>
              <button
                onClick={() => {
                  feedbackMut.mutate({
                    articleId: selectedArticle.id,
                    helpful: false,
                  });
                  setHelpfulVote(false);
                }}
                style={{
                  background:
                    helpfulVote === false ? "var(--color-danger-bg)" : "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  padding: "6px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                无帮助（{selectedArticle.unhelpful_count ?? 0}）
              </button>
            </div>
          </div>
        </div>
      ) : (
        // ─── 列表视图 ───
        <>
          {/* 分类导航 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => setSearch("")}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                background: !search ? "var(--color-primary)" : "#fff",
                color: !search ? "#fff" : "var(--color-text)",
                border: "1px solid var(--color-border)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              全部
            </button>
            {cats.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setSearch(c.name)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  background: search === c.name ? "var(--color-primary)" : "#fff",
                  color: search === c.name ? "#fff" : "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {listQ.isLoading ? (
              <SkeletonGroup lines={6} style={{ padding: 20 }} />
            ) : articles.length === 0 ? (
              <EmptyState icon="📚" title="暂无帮助文章" description="当前没有相关内容" />
            ) : (
              <div>
                {articles.map((a: any) => (
                  <div
                    key={a.id}
                    onClick={() => setSelectedArticle(a)}
                    style={{
                      padding: "14px 20px",
                      borderBottom: "1px solid var(--color-border)",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: 15,
                            color: "var(--color-text)",
                            marginBottom: 4,
                          }}
                        >
                          {a.title}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                          {a.category && <span style={{ marginRight: 12 }}>{a.category}</span>}
                          {a.tags &&
                            a.tags.split(",").map((t: string) => (
                              <span
                                key={t}
                                style={{
                                  marginRight: 6,
                                  background: "var(--color-bg)",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                {t.trim()}
                              </span>
                            ))}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-text-secondary)",
                          display: "flex",
                          gap: 8,
                        }}
                      >
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
    </div>
  );
}

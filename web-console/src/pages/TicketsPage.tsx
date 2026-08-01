import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 我的工单 对齐 SPEC-§26（用户端）
 * 列表 / 创建 / 详情回复 / 满意度评价
 */
interface Ticket { id: number; ticket_no: string; title: string; category: string; category_label: string; priority: string; priority_label: string; status: string; status_label: string; created_at: string; unread: number; description?: string; satisfaction?: { rating: number; comment: string | null } | null; }
interface Reply { id: number; user_id: number; is_staff: boolean; content: string; attachments: string[]; created_at: string; }

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const label: React.CSSProperties = { fontSize: 13, color: "#64748b", display: "block", marginBottom: 4 };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#fef3c7", color: "#92400e" },
  processing: { bg: "#dbeafe", color: "#1e40af" },
  resolved: { bg: "#dcfce7", color: "#166534" },
  closed: { bg: "#e2e8f0", color: "#475569" },
};
const CATEGORIES = [
  ["billing", "计费问题"], ["api", "API 调用"], ["account", "账户与安全"], ["key", "Key 管理"],
  ["invoice_refund", "发票与退款"], ["feature_request", "功能建议"], ["other", "其他"],
] as const;

export default function TicketsPage() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", category: "billing", priority: "normal", description: "" });
  const [replyDraft, setReplyDraft] = useState("");
  const [rating, setRating] = useState(0);
  const [satComment, setSatComment] = useState("");

  const listQ = useQuery({
    queryKey: ["me-tickets"],
    queryFn: async () => (await api.get<{ data: { list: Ticket[] } }>("/me/tickets?page_size=50")).data.data,
  });
  const detailQ = useQuery({
    queryKey: ["me-ticket-detail", activeId],
    queryFn: async () => (await api.get<{ data: { ticket: Ticket; replies: Reply[] } }>(`/me/tickets/${activeId}`)).data.data,
    enabled: !!activeId,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post("/me/tickets", form)).data,
    onSuccess: () => { setNotice({ type: "success", msg: "工单已提交" }); setView("list"); setForm({ title: "", category: "billing", priority: "normal", description: "" }); qc.invalidateQueries({ queryKey: ["me-tickets"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const replyMut = useMutation({
    mutationFn: async () => (await api.post(`/me/tickets/${activeId}/reply`, { content: replyDraft })).data,
    onSuccess: () => { setReplyDraft(""); qc.invalidateQueries({ queryKey: ["me-ticket-detail"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const closeMut = useMutation({
    mutationFn: async () => (await api.post(`/me/tickets/${activeId}/close`, {})).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-ticket-detail"] }); qc.invalidateQueries({ queryKey: ["me-tickets"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const satMut = useMutation({
    mutationFn: async () => (await api.post(`/me/tickets/${activeId}/satisfaction`, { rating, comment: satComment })).data,
    onSuccess: () => { setNotice({ type: "success", msg: "感谢您的评价" }); setRating(0); setSatComment(""); qc.invalidateQueries({ queryKey: ["me-ticket-detail"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  useEffect(() => {
    setRating(0); setSatComment("");
  }, [activeId]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>我的工单</h2>
        <button onClick={() => setView("create")} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>+ 创建工单</button>
      </div>

      {view === "create" ? (
        <div style={card}>
          <h3 style={{ margin: "0 0 16px" }}>创建工单</h3>
          <label style={label}>标题</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="简洁描述问题" style={inp} />
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>分类</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inp}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>优先级</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inp}>
                <option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option>
              </select>
            </div>
          </div>
          <label style={label}>描述</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="详细描述您遇到的问题" rows={5} style={{ ...inp, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setView("list")} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
            <button onClick={() => createMut.mutate()} disabled={!form.title || !form.description} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>{createMut.isPending ? "提交中..." : "提交工单"}</button>
          </div>
        </div>
      ) : view === "detail" && detailQ.data ? (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>工单 {detailQ.data.ticket.ticket_no}</h3>
            <button onClick={() => setView("list")} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>← 返回</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ ...(STATUS_STYLE[detailQ.data.ticket.status] ?? STATUS_STYLE.pending), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{detailQ.data.ticket.status_label}</span>
            <span style={{ padding: "2px 10px", borderRadius: 6, fontSize: 12, background: "#f1f5f9", color: "#64748b" }}>{detailQ.data.ticket.category_label}</span>
            <span style={{ padding: "2px 10px", borderRadius: 6, fontSize: 12, background: "#f1f5f9", color: "#64748b" }}>优先级: {detailQ.data.ticket.priority_label}</span>
          </div>
          <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
            <strong>{detailQ.data.ticket.title}</strong>
            <div style={{ color: "#475569", marginTop: 6 }}>{detailQ.data.ticket.description}</div>
          </div>

          {/* 回复流 */}
          <div style={{ marginBottom: 16 }}>
            {detailQ.data.replies.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: r.is_staff ? "flex-start" : "flex-end", marginBottom: 10 }}>
                <div style={{ maxWidth: "70%", padding: "10px 14px", borderRadius: 10, background: r.is_staff ? "#eef2ff" : "#dcfce7", lineHeight: 1.6, fontSize: 14 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{r.is_staff ? "客服" : "我"} · {new Date(r.created_at).toLocaleString()}</div>
                  {r.content}
                </div>
              </div>
            ))}
          </div>

          {/* 回复框（未关闭） */}
          {detailQ.data.ticket.status !== "closed" && (
            <div style={{ display: "flex", gap: 8 }}>
              <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} placeholder="输入回复..." rows={2} style={{ ...inp, marginBottom: 0, flex: 1 }} />
              <button onClick={() => replyMut.mutate()} disabled={!replyDraft} style={{ ...btnBase, background: "#2563eb", color: "#fff", alignSelf: "flex-end" }}>发送</button>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {detailQ.data.ticket.status === "pending" && (
              <button onClick={() => closeMut.mutate()} style={{ ...btnBase, background: "#fee2e2", color: "#dc2626" }}>关闭工单</button>
            )}
            {["resolved", "closed"].includes(detailQ.data.ticket.status) && !detailQ.data.ticket.satisfaction && (
              <div style={{ padding: 12, background: "#f0f9ff", borderRadius: 8, width: "100%" }}>
                <strong>请对本次服务评价</strong>
                <div style={{ display: "flex", gap: 4, margin: "8px 0" }}>
                  {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} style={{ fontSize: 24, background: "none", border: "none", cursor: "pointer", opacity: rating >= n ? 1 : 0.3 }}>⭐</button>)}
                </div>
                <input value={satComment} onChange={(e) => setSatComment(e.target.value)} placeholder="补充意见（可选）" style={inp} />
                <button onClick={() => satMut.mutate()} disabled={!rating} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>提交评价</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={card}>
          {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? <div style={{ color: "#94a3b8" }}>暂无工单</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>工单号</th><th style={{ padding: "8px" }}>标题</th><th style={{ padding: "8px" }}>分类</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>时间</th>
              </tr></thead>
              <tbody>
                {listQ.data?.list.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer" }} onClick={() => { setActiveId(t.id); setView("detail"); }}>
                    <td style={{ padding: "8px", fontWeight: 600, color: "#2563eb" }}>{t.ticket_no}{t.unread > 0 ? <span style={{ background: "#dc2626", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 11, marginLeft: 6 }}>{t.unread}</span> : null}</td>
                    <td style={{ padding: "8px" }}>{t.title}</td>
                    <td style={{ padding: "8px", color: "#64748b" }}>{t.category_label}</td>
                    <td style={{ padding: "8px" }}><span style={{ ...(STATUS_STYLE[t.status] ?? STATUS_STYLE.pending), padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>{t.status_label}</span></td>
                    <td style={{ padding: "8px", color: "#64748b" }}>{t.created_at ? new Date(t.created_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 3000, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

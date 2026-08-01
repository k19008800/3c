import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 工单管理 对齐 SPEC-§26（客服端）
 * 队列(列表/看板) + 详情 + 统计
 */
interface AdminTicket { id: number; ticket_no: string; title: string; category: string; category_label: string; priority: string; status: string; status_label: string; email: string; username: string; assignee_name: string | null; created_at: string; }
interface AdminTicketDetail { ticket: any; replies: any[]; operation_logs: any[]; satisfaction: any | null; all_tags: any[]; }

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const icon = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#fef3c7", color: "#92400e" },
  processing: { bg: "#dbeafe", color: "#1e40af" },
  resolved: { bg: "#dcfce7", color: "#166534" },
  closed: { bg: "#e2e8f0", color: "#475569" },
};
const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  low: { bg: "#f1f5f9", color: "#64748b" }, normal: { bg: "#e0f2fe", color: "#0369a1" }, high: { bg: "#fef3c7", color: "#b45309" }, urgent: { bg: "#fee2e2", color: "#dc2626" },
};
const HELP = "客服统一处理用户工单队列。支持按状态/分类/优先级/客服筛选，Kanban 视图拖拽变更状态，工单详情含完整回复流与操作日志，可回复/分配/标签/备注/标记解决。";

export default function AdminTicketsPage() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [view, setView] = useState<"list" | "kanban" | "stats" | "detail">("list");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [assignModal, setAssignModal] = useState<number | null>(null);
  const [assignTo, setAssignTo] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-tickets", status, search],
    queryFn: async () => {
      const p = new URLSearchParams({ page_size: "50" });
      if (status) p.set("status", status);
      if (search) p.set("search", search);
      return (await api.get<{ data: { list: AdminTicket[]; stats: any; avg_response_seconds: number; avg_resolve_seconds: number } }>(`/admin/tickets?${p}`)).data.data;
    },
  });
  const statsQ = useQuery({ queryKey: ["admin-ticket-stats"], queryFn: async () => (await api.get<{ data: any }>("/admin/tickets/stats")).data.data });
  const detailQ = useQuery({
    queryKey: ["admin-ticket-detail", activeId],
    queryFn: async () => (await api.get<{ data: AdminTicketDetail }>(`/admin/tickets/${activeId}`)).data.data,
    enabled: !!activeId,
  });

  const statusMut = useMutation({
    mutationFn: async ({ st }: { st: string }) => (await api.post(`/admin/tickets/${activeId}/status`, { status: st })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-ticket-detail"] }); qc.invalidateQueries({ queryKey: ["admin-tickets"] }); qc.invalidateQueries({ queryKey: ["admin-ticket-stats"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const replyMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/tickets/${activeId}/reply`, { content: replyDraft })).data,
    onSuccess: () => { setReplyDraft(""); setShowReply(false); qc.invalidateQueries({ queryKey: ["admin-ticket-detail"] }); qc.invalidateQueries({ queryKey: ["admin-tickets"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const noteMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/tickets/${activeId}/note`, { note: noteDraft })).data,
    onSuccess: () => { setNoteDraft(""); qc.invalidateQueries({ queryKey: ["admin-ticket-detail"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const assignMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/tickets/${assignModal}/assign`, { assignee_id: Number(assignTo) })).data,
    onSuccess: () => { setAssignModal(null); qc.invalidateQueries({ queryKey: ["admin-tickets"] }); qc.invalidateQueries({ queryKey: ["admin-ticket-detail"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const fmtDur = (sec: number) => sec > 0 ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m` : "—";
  const tk = detailQ.data?.ticket;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>工单管理 <span onClick={() => setHelp(!help)} style={icon} title="帮助">[?]</span></h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>客服支持 · SPEC-§26</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {([["list", "列表视图"], ["kanban", "看板视图"], ["stats", "工单统计"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{ ...btnBase, background: view === k ? "#2563eb" : "#fff", color: view === k ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>{l}</button>
        ))}
        {view === "list" && (
          <>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inp, width: 120, marginBottom: 0 }}>
              <option value="">全部</option><option value="pending">待处理</option><option value="processing">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option>
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索工单号/标题/用户名" style={{ ...inp, width: 200, marginBottom: 0 }} />
          </>
        )}
      </div>

      {/* 统计概览条 */}
      {view !== "detail" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {([["待处理", listQ.data?.stats?.pending ?? 0, "#92400e"], ["处理中", listQ.data?.stats?.processing ?? 0, "#1e40af"], ["已解决", listQ.data?.stats?.resolved ?? 0, "#166534"], ["已关闭", listQ.data?.stats?.closed ?? 0, "#475569"], ["平均响应", fmtDur(listQ.data?.avg_response_seconds ?? 0), "#64748b"]] as const).map(([l, v, c]) => (
            <div key={l as string} style={{ padding: "10px 16px", background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>{l}</div><div style={{ fontWeight: 700, color: c as string }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {help && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setHelp(false)}>
          <div style={{ ...card, width: 480 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: "0 0 8px" }}>帮助 · 工单管理</h4><p style={{ color: "#475569", lineHeight: 1.7, margin: 0 }}>{HELP}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><button onClick={() => setHelp(false)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button></div>
          </div>
        </div>
      )}

      {view === "detail" && detailQ.data ? (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>工单 {tk.ticket_no} <span style={{ fontSize: 14, color: "#64748b" }}>by {tk.username ?? tk.email}</span></h3>
            <button onClick={() => { setActiveId(null); setView("list"); }} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>← 返回队列</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ ...(STATUS_STYLE[tk.status] ?? STATUS_STYLE.pending), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{tk.status_label}</span>
            <span style={{ ...(PRIORITY_STYLE[tk.priority] ?? PRIORITY_STYLE.normal), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{tk.priority}</span>
            <span style={{ padding: "2px 10px", borderRadius: 6, fontSize: 12, background: "#f1f5f9", color: "#64748b" }}>{tk.category_label}</span>
            {tk.assignee_name && <span style={{ padding: "2px 10px", borderRadius: 6, fontSize: 12, background: "#eef2ff", color: "#4f46e5" }}>👤 {tk.assignee_name}</span>}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(tk.status === "pending" || tk.status === "processing") && <button onClick={() => statusMut.mutate({ st: "processing" })} style={{ ...btnBase, background: "#dbeafe", color: "#1e40af" }}>标记处理中</button>}
            {tk.status === "processing" && <button onClick={() => statusMut.mutate({ st: "resolved" })} style={{ ...btnBase, background: "#dcfce7", color: "#166534" }}>标记已解决</button>}
            {tk.status === "resolved" && <button onClick={() => statusMut.mutate({ st: "closed" })} style={{ ...btnBase, background: "#e2e8f0", color: "#475569" }}>确认关闭</button>}
            <button onClick={() => setAssignModal(tk.id)} style={{ ...btnBase, background: "#eef2ff", color: "#4f46e5" }}>分配</button>
            <button onClick={() => setShowReply(!showReply)} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>回复</button>
          </div>

          <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
            <strong>{tk.title}</strong>
            <div style={{ color: "#475569", marginTop: 6 }}>{tk.description}</div>
          </div>

          {showReply && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} rows={3} placeholder="回复用户..." style={{ ...inp, marginBottom: 0, flex: 1 }} autoFocus />
              <button onClick={() => replyMut.mutate()} disabled={!replyDraft} style={{ ...btnBase, background: "#2563eb", color: "#fff", alignSelf: "flex-end" }}>发送</button>
            </div>
          )}

          {/* 回复流 */}
          <div style={{ marginBottom: 16 }}>
            {detailQ.data.replies.map((r: any) => (
              <div key={r.id} style={{ display: "flex", justifyContent: r.is_staff ? "flex-start" : "flex-end", marginBottom: 10 }}>
                <div style={{ maxWidth: "70%", padding: "10px 14px", borderRadius: 10, background: r.is_staff ? "#eef2ff" : "#dcfce7", lineHeight: 1.6, fontSize: 14 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{r.is_staff ? "客服" : "用户"} · {new Date(r.created_at).toLocaleString()}</div>
                  {r.content}
                </div>
              </div>
            ))}
          </div>

          {/* 内部备注 + 标签 */}
          <div style={{ marginTop: 16, padding: 12, background: "#f0fdf4", borderRadius: 8 }}>
            <strong style={{ fontSize: 13 }}>内部备注（用户不可见）</strong>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="记录处理思路..." style={{ ...inp, marginBottom: 0, flex: 1 }} />
              <button onClick={() => noteMut.mutate()} disabled={!noteDraft} style={{ ...btnBase, background: "#16a34a", color: "#fff" }}>添加备注</button>
            </div>
          </div>

          {/* 操作日志 */}
          <div style={{ marginTop: 16 }}>
            <strong style={{ fontSize: 13 }}>操作记录</strong>
            {(detailQ.data.operation_logs ?? []).map((o: any) => (
              <div key={o.id} style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>· {new Date(o.created_at).toLocaleString()} — {o.action}: {o.detail ?? ""}</div>
            ))}
          </div>

          {detailQ.data.satisfaction && (
            <div style={{ marginTop: 16, padding: 12, background: "#fefce8", borderRadius: 8 }}>
              <strong>用户评价: {"⭐".repeat(detailQ.data.satisfaction.rating)}{"☆".repeat(5 - detailQ.data.satisfaction.rating)}</strong>
              {detailQ.data.satisfaction.comment && <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{detailQ.data.satisfaction.comment}</div>}
            </div>
          )}
        </div>
      ) : view === "stats" ? (
        <div style={card}>
          <h3 style={{ margin: "0 0 16px" }}>工单统计</h3>
          {!statsQ.data ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                {[["总工单", statsQ.data.total], ["已解决", `${statsQ.data.resolved} (${statsQ.data.resolve_rate}%)`], ["平均响应", fmtDur(statsQ.data.avg_response_seconds)], ["平均解决", fmtDur(statsQ.data.avg_resolve_seconds)], ["满意度", `${statsQ.data.satisfaction ?? 0}/5`]].map(([l, v]) => (
                  <div key={l as string} style={{ padding: "12px 18px", background: "#f8fafc", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{l}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
              <strong style={{ fontSize: 13 }}>分类分布</strong>
              {(statsQ.data.category_distribution ?? []).map((c: any) => (
                <div key={c.category} style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                  <span style={{ width: 100, fontSize: 13 }}>{c.category}</span>
                  <div style={{ flex: 1, background: "#e2e8f0", height: 18, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(c.c / (statsQ.data.total || 1) * 100, 100)}%`, background: "#2563eb", height: "100%" }} />
                  </div>
                  <span style={{ fontSize: 13, color: "#64748b" }}>{c.c}</span>
                </div>
              ))}
              <strong style={{ fontSize: 13, display: "block", marginTop: 16 }}>客服排行</strong>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "6px" }}>客服</th><th style={{ padding: "6px" }}>工单数</th><th style={{ padding: "6px" }}>满意度</th></tr></thead>
                <tbody>
                  {(statsQ.data.staff_ranking ?? []).map((s: any) => (
                    <tr key={s.username} style={{ borderTop: "1px solid #f1f5f9" }}><td style={{ padding: "6px" }}>{s.username}</td><td style={{ padding: "6px" }}>{s.tickets}</td><td style={{ padding: "6px" }}>{(s.satisfaction || 0).toFixed(1)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : (
        /* 看板 */
        <div style={{ display: "grid", gridTemplateColumns: view === "kanban" ? "repeat(4,1fr)" : "1fr", gap: 12 }}>
          {view === "list" ? (
            <div style={card}>
              {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? <div style={{ color: "#94a3b8" }}>暂无工单</div> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>工单号</th><th style={{ padding: "8px" }}>标题</th><th style={{ padding: "8px" }}>用户</th><th style={{ padding: "8px" }}>分类</th><th style={{ padding: "8px" }}>优先级</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>分配</th><th style={{ padding: "8px" }}>时间</th>
                  </tr></thead>
                  <tbody>
                    {listQ.data?.list.map((t) => (
                      <tr key={t.id} style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer" }} onClick={() => { setActiveId(t.id); setView("detail"); }}>
                        <td style={{ padding: "8px", fontWeight: 600, color: "#2563eb" }}>{t.ticket_no}</td>
                        <td style={{ padding: "8px" }}>{t.title}</td>
                        <td style={{ padding: "8px", color: "#64748b" }}>{t.username ?? t.email}</td>
                        <td style={{ padding: "8px", color: "#64748b" }}>{t.category_label}</td>
                        <td style={{ padding: "8px" }}><span style={{ ...(PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.normal), padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{t.priority}</span></td>
                        <td style={{ padding: "8px" }}><span style={{ ...(STATUS_STYLE[t.status] ?? STATUS_STYLE.pending), padding: "2px 8px", borderRadius: 6, fontSize: 11 }}>{t.status_label}</span></td>
                        <td style={{ padding: "8px", color: "#64748b" }}>{t.assignee_name ?? "—"}</td>
                        <td style={{ padding: "8px", color: "#64748b" }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            (["pending", "processing", "resolved", "closed"] as const).map((st) => (
              <div key={st} style={{ ...card, minHeight: 200 }}>
                <strong style={{ color: (STATUS_STYLE[st] ?? { color: "#64748b" }).color }}>{st === "pending" ? "待处理" : st === "processing" ? "处理中" : st === "resolved" ? "已解决" : "已关闭"}</strong>
                {listQ.data?.list.filter((t) => t.status === st).map((t) => (
                  <div key={t.id} onClick={() => { setActiveId(t.id); setView("detail"); }} style={{ padding: 10, marginTop: 8, background: "#f8fafc", borderRadius: 6, cursor: "pointer", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#2563eb" }}>{t.ticket_no}</div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{t.category_label}{t.assignee_name ? ` · 👤${t.assignee_name}` : ""}</div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* 分配弹窗 */}
      {assignModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setAssignModal(null)}>
          <div style={{ ...card, width: 400 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: "0 0 12px" }}>分配工单</h4>
            <input value={assignTo} onChange={(e) => setAssignTo(e.target.value)} placeholder="客服用户 ID" type="number" style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAssignModal(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => assignMut.mutate()} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>确认分配</button>
            </div>
          </div>
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

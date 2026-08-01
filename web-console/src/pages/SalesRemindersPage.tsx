import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * §11.3 跟进提醒
 * [?] 管理客户跟进提醒列表。支持按状态筛选，新增跟进任务，以及标记完成。
 */
export default function SalesRemindersPage() {
  const [status, setStatus] = useState("");
  const q = useQuery({
    queryKey: ["me-follow-reminders", status],
    queryFn: async () => (await api.get(`/me/follow-reminders?status=${status}`)).data.data,
  });
  const qc = useQueryClient();
  const completeMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/me/follow-reminders/${id}/complete`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-follow-reminders"] }),
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ user_id: "", title: "", description: "", due_at: "" });
  const createMut = useMutation({
    mutationFn: async (d: typeof form) => (await api.post("/me/follow-reminders", { user_id: Number(d.user_id), title: d.title, description: d.description, due_at: d.due_at })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-follow-reminders"] }); setShowForm(false); setForm({ user_id: "", title: "", description: "", due_at: "" }); },
  });

  const now = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <h2>
        跟进提醒
        <span
          title="跟进提醒 — 管理和创建客户跟进任务。按状态筛选，查看待办跟进，标记完成。每日自动提醒到期跟进事项。"
          style={{ cursor: "help", fontSize: 14, color: "#94a3b8", marginLeft: 6 }}
        >
          [?]
        </span>
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
          <option value="">全部</option>
          <option value="pending">待办</option>
          <option value="completed">已完成</option>
        </select>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer" }}>
          + 新增提醒
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 8, maxWidth: 500 }}>
          <input placeholder="客户ID" value={form.user_id} onChange={(e) => setForm(f => ({ ...f, user_id: e.target.value }))} style={{ padding: "6px", borderRadius: 4, border: "1px solid #cbd5e1" }} />
          <input placeholder="标题" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} style={{ padding: "6px", borderRadius: 4, border: "1px solid #cbd5e1" }} />
          <textarea placeholder="描述" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} style={{ padding: "6px", borderRadius: 4, border: "1px solid #cbd5e1", minHeight: 60 }} />
          <input type="date" value={form.due_at} onChange={(e) => setForm(f => ({ ...f, due_at: e.target.value }))} style={{ padding: "6px", borderRadius: 4, border: "1px solid #cbd5e1" }} />
          <button onClick={() => createMut.mutate(form)} disabled={!form.title || !form.user_id || !form.due_at} style={{ padding: "6px 12px", borderRadius: 4, border: "none", background: "#22c55e", color: "#fff", cursor: "pointer", alignSelf: "flex-start" }}>创建</button>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={thS}>标题</th><th style={thS}>客户ID</th><th style={thS}>描述</th>
            <th style={thS}>到期日</th><th style={thS}>状态</th><th style={thS}>操作</th>
          </tr>
        </thead>
        <tbody>
          {q.data?.list?.map((r: any) => {
            const overdue = r.status === "pending" && r.due_at?.slice(0, 10) <= now;
            return (
              <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0", background: overdue ? "#fef2f2" : "transparent" }}>
                <td style={tdS}><strong>{r.title}</strong></td>
                <td style={tdS}>{r.user_id}</td>
                <td style={tdS}>{r.description || "-"}</td>
                <td style={tdS}><span style={overdue ? { color: "#ef4444", fontWeight: 600 } : {}}>{r.due_at?.slice(0, 10)}</span></td>
                <td style={tdS}>{r.status === "pending" ? (overdue ? "⚠️ 逾期" : "待办") : "✅ 已完成"}</td>
                <td style={tdS}>
                  {r.status === "pending" && <button onClick={() => completeMut.mutate(r.id)} style={{ padding: "2px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #22c55e", background: "#fff", color: "#22c55e", cursor: "pointer" }}>完成</button>}
                </td>
              </tr>
            );
          })}
          {!q.data?.list?.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>暂无提醒</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 13, fontWeight: 600, color: "#475569" };
const tdS: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "#334155" };

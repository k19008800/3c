import { useParams } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * §11 CRM 客户详情页
 * [?] 查看客户完整信息：联系人详情、联系记录、标签管理、状态变更、调用记录。
 */
export default function SalesCustomerDetailPage() {
  const { userId } = useParams();
  const uid = Number(userId);
  const q = useQuery({
    queryKey: ["me-customer", uid],
    queryFn: async () => (await api.get(`/me/customers/${uid}`)).data.data,
    enabled: !!uid,
  });
  const qc = useQueryClient();
  const [contactData, setContactData] = useState({ method: "phone", summary: "", nextFollowUp: "" });
  const [statusData, setStatusData] = useState({ status: "", reason: "" });
  const [tags, setTags] = useState<number[]>([]);

  const contactMut = useMutation({
    mutationFn: async (d: typeof contactData) => (await api.post(`/me/customers/${uid}/contacts`, { method: d.method, summary: d.summary, next_follow_up: d.nextFollowUp || undefined })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-customer", uid] }); setContactData({ method: "phone", summary: "", nextFollowUp: "" }); },
  });
  const statusMut = useMutation({
    mutationFn: async (d: typeof statusData) => (await api.put(`/me/customers/${uid}/status`, { status: d.status, reason: d.reason })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-customer", uid] }); setStatusData({ status: "", reason: "" }); },
  });
  const tagMut = useMutation({
    mutationFn: async (ids: number[]) => (await api.put(`/me/customers/${uid}/tags`, { tag_ids: ids })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-customer", uid] }),
  });

  const tagsQ = useQuery({
    queryKey: ["me-customer-tags"],
    queryFn: async () => (await api.get("/me/customer-tags")).data.data,
  });

  const customer = q.data?.customer;
  if (!customer) return <div style={{ padding: 32, color: "#94a3b8" }}>加载中...</div>;

  const currentTags = q.data?.tags?.map((t: any) => t.id) || tags;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h2>
        客户详情 — {customer.username || customer.email}
        <span
          title="客户详情页面 — 查看完整客户信息、消费趋势、联系记录、调用记录和工单历史。支持状态变更、联系记录录入和标签管理。"
          style={{ cursor: "help", fontSize: 14, color: "#94a3b8", marginLeft: 6 }}
        >
          [?]
        </span>
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* 基本信息 */}
        <Card title="基本信息">
          <Row label="用户 ID">{customer.user_id}</Row>
          <Row label="邮箱">{customer.email}</Row>
          <Row label="状态"><StatusBadge status={customer.status} /></Row>
          <Row label="余额">¥{(customer.balance / 100).toFixed(2)}</Row>
          <Row label="注册时间">{customer.user_created_at?.slice(0, 10)}</Row>
          <Row label="实名">{customer.real_name_status || "未认证"}</Row>
        </Card>

        {/* 状态变更 */}
        <Card title="状态变更">
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select value={statusData.status} onChange={(e) => setStatusData(s => ({ ...s, status: e.target.value }))} style={{ flex: 1, padding: "6px", borderRadius: 4, border: "1px solid #cbd5e1" }}>
              <option value="">选择新状态</option>
              <option value="lead">线索</option>
              <option value="trial">试用</option>
              <option value="active">活跃</option>
              <option value="silent">沉默</option>
              <option value="churned">流失</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input placeholder="变更原因（可选）" value={statusData.reason} onChange={(e) => setStatusData(s => ({ ...s, reason: e.target.value }))} style={{ flex: 1, padding: "6px", borderRadius: 4, border: "1px solid #cbd5e1" }} />
          </div>
          <button onClick={() => statusData.status && statusMut.mutate(statusData)} disabled={!statusData.status} style={{ padding: "6px 12px", borderRadius: 4, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer" }}>
            更新状态
          </button>
          {q.data?.statusLogs?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
              {q.data.statusLogs.map((l: any) => <div key={l.id}>#{l.id} {l.from_status}→{l.to_status} {l.reason}</div>)}
            </div>
          )}
        </Card>

        {/* 标签 */}
        <Card title={`标签 (${currentTags?.length || 0}/5)`}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {tagsQ.data?.list?.map((t: any) => {
              const active = currentTags?.includes(t.id);
              return (
                <button key={t.id} onClick={() => {
                  const next = active ? currentTags.filter((id: number) => id !== t.id) : [...(currentTags || []), t.id];
                  setTags(next);
                  tagMut.mutate(next);
                }} style={{
                  padding: "4px 10px", borderRadius: 12, fontSize: 12, border: active ? "2px solid " + t.color : "1px solid #cbd5e1",
                  background: active ? t.color + "22" : "transparent", color: active ? t.color : "#64748b", cursor: "pointer",
                }}>
                  {t.name}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 联系记录 */}
      <Card title="联系记录" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={contactData.method} onChange={(e) => setContactData(d => ({ ...d, method: e.target.value }))} style={{ padding: "6px", borderRadius: 4, border: "1px solid #cbd5e1" }}>
            <option value="phone">电话</option><option value="wechat">微信</option><option value="email">邮件</option><option value="meeting">面谈</option><option value="other">其他</option>
          </select>
          <input placeholder="沟通摘要" value={contactData.summary} onChange={(e) => setContactData(d => ({ ...d, summary: e.target.value }))} style={{ flex: 1, padding: "6px", borderRadius: 4, border: "1px solid #cbd5e1", minWidth: 200 }} />
          <input type="date" value={contactData.nextFollowUp} onChange={(e) => setContactData(d => ({ ...d, nextFollowUp: e.target.value }))} style={{ padding: "6px", borderRadius: 4, border: "1px solid #cbd5e1" }} />
          <button onClick={() => contactMut.mutate(contactData)} disabled={!contactData.summary} style={{ padding: "6px 12px", borderRadius: 4, border: "none", background: "#22c55e", color: "#fff", cursor: "pointer" }}>添加</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={thS}>时间</th><th style={thS}>方式</th><th style={thS}>摘要</th><th style={thS}>下次跟进</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.contacts?.map((c: any) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={tdS}>{c.created_at?.slice(0, 16)}</td>
                <td style={tdS}>{c.method}</td>
                <td style={tdS}>{c.summary}</td>
                <td style={tdS}>{c.next_follow_up?.slice(0, 10) || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, ...style }}><h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#334155" }}>{title}</h4>{children}</div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", marginBottom: 6, fontSize: 13 }}><span style={{ width: 100, color: "#64748b" }}>{label}</span><span style={{ color: "#334155" }}>{children}</span></div>;
}
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { lead: "#f59e0b", trial: "#6366f1", active: "#22c55e", silent: "#94a3b8", churned: "#ef4444" };
  return <span style={{ background: colors[status] || "#94a3b8", color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 12 }}>{status}</span>;
}
const thS: React.CSSProperties = { padding: "6px 10px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#475569" };
const tdS: React.CSSProperties = { padding: "6px 10px", fontSize: 12, color: "#334155" };

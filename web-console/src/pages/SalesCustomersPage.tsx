import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * §11 CRM 客户列表（业务员侧）
 * [?] 查看分配给您的所有客户，可按状态/搜索筛选
 */
export default function SalesCustomersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["me-customers", status, search, page],
    queryFn: async () => (await api.get(`/me/customers?status=${status}&search=${search}&page=${page}&page_size=20`)).data.data,
    placeholderData: keepPreviousData,
  });
  const qc = useQueryClient();
  const assignMut = useMutation({
    mutationFn: async (userId: number) => (await api.post(`/me/customers/${userId}/assign`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-customers"] }),
  });

  return (
    <div>
      <h2>
        我的客户
        <span
          title="客户管理 — 查看和管理分配给您的客户。可按状态、关键词搜索筛选，支持客户状态变更、联系记录录入、标签管理和跟进提醒。"
          style={{ cursor: "help", fontSize: 14, color: "#94a3b8", marginLeft: 6 }}
        >
          [?]
        </span>
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input placeholder="搜索客户..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", width: 240 }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
          <option value="">全部状态</option>
          <option value="lead">线索</option>
          <option value="trial">试用</option>
          <option value="active">活跃</option>
          <option value="silent">沉默</option>
          <option value="churned">流失</option>
        </select>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={thS}>ID</th><th style={thS}>用户名</th><th style={thS}>邮箱</th>
            <th style={thS}>状态</th><th style={thS}>余额</th><th style={thS}>标签数</th>
            <th style={thS}>更新时间</th><th style={thS}>操作</th>
          </tr>
        </thead>
        <tbody>
          {q.data?.list?.map((c: any) => (
            <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={tdS}>{c.user_id}</td>
              <td style={tdS}>{c.username}</td>
              <td style={tdS}>{c.email}</td>
              <td style={tdS}><StatusBadge status={c.status} /></td>
              <td style={tdS}>¥{(c.balance / 100).toFixed(2)}</td>
              <td style={tdS}>{Array.isArray(c.tags) ? c.tags.length : 0}</td>
              <td style={tdS}>{c.updated_at?.slice(0, 10)}</td>
              <td style={tdS}>
                <a href={`/sales/customers/${c.user_id}`} style={{ color: "#3b82f6", marginRight: 8 }}>详情</a>
                {!c.salesperson_id && <button onClick={() => assignMut.mutate(c.user_id)} style={{ padding: "2px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #3b82f6", background: "#fff", color: "#3b82f6", cursor: "pointer" }}>认领</button>}
              </td>
            </tr>
          ))}
          {!q.data?.list?.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>暂无客户</td></tr>}
        </tbody>
      </table>

      {q.data?.pagination && (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={btn}>上一页</button>
          <span>第 {q.data.pagination.page}/{Math.ceil(q.data.pagination.total / 20)} 页 (共 {q.data.pagination.total} 条)</span>
          <button disabled={page >= Math.ceil(q.data.pagination.total / 20)} onClick={() => setPage(p => p + 1)} style={btn}>下一页</button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { lead: "#f59e0b", trial: "#6366f1", active: "#22c55e", silent: "#94a3b8", churned: "#ef4444" };
  return <span style={{ background: colors[status] || "#94a3b8", color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 12 }}>{status}</span>;
}

const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 13, fontWeight: 600, color: "#475569" };
const tdS: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "#334155" };
const btn: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 13 };

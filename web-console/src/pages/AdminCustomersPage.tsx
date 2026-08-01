import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * §11 管理端客户一览
 * [?] 管理后台查看所有客户及其销售归属。支持按状态、销售员、关键词筛选。
 */
export default function AdminCustomersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [page, setPage] = useState(1);

  const spQ = useQuery({
    queryKey: ["admin-sales-persons"],
    queryFn: async () => (await api.get("/admin/sales-persons")).data.data,
  });

  const q = useQuery({
    queryKey: ["admin-customers", status, search, salespersonId, page],
    queryFn: async () => (await api.get(`/admin/customers?status=${status}&search=${search}&salesperson_id=${salespersonId}&page=${page}&page_size=20`)).data.data,
  });

  return (
    <div>
      <h2>
        客户管理（管理端）
        <span
          title="管理端客户管理 — 查看平台所有客户及其销售归属。支持按状态、销售员、关键词筛选，支持分页浏览。"
          style={{ cursor: "help", fontSize: 14, color: "#94a3b8", marginLeft: 6 }}
        >
          [?]
        </span>
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="搜索客户..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", width: 200 }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
          <option value="">全部状态</option>
          <option value="lead">线索</option>
          <option value="trial">试用</option>
          <option value="active">活跃</option>
          <option value="silent">沉默</option>
          <option value="churned">流失</option>
        </select>
        <select value={salespersonId} onChange={(e) => { setSalespersonId(e.target.value); setPage(1); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
          <option value="">全部销售员</option>
          {spQ.data?.list?.map((sp: any) => <option key={sp.id} value={sp.id}>{sp.username || sp.email}</option>)}
        </select>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={thS}>ID</th><th style={thS}>用户名</th><th style={thS}>邮箱</th>
            <th style={thS}>状态</th><th style={thS}>销售员</th><th style={thS}>标签数</th>
            <th style={thS}>更新时间</th>
          </tr>
        </thead>
        <tbody>
          {q.data?.list?.map((c: any) => (
            <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={tdS}>{c.user_id}</td>
              <td style={tdS}>{c.username}</td>
              <td style={tdS}>{c.email}</td>
              <td style={tdS}><StatusBadge status={c.status} /></td>
              <td style={tdS}>{c.salesperson_name || "-"}</td>
              <td style={tdS}>{Array.isArray(c.tags) ? c.tags.length : 0}</td>
              <td style={tdS}>{c.updated_at?.slice(0, 10)}</td>
            </tr>
          ))}
          {!q.data?.list?.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>暂无客户</td></tr>}
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

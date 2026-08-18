import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, EmptyState, Pagination } from "@3cloud/shared-ui";

/**
 * 实时活动流（运维操作）
 * 数据来自真实后端：GET /admin/ops/activity（audit_logs 倒序分页）。
 * 展示最近的管理员/系统操作：操作者、动作、资源、时间。
 */

interface Activity {
  id: number;
  user_id: number | null;
  user: { id: number; email: string | null; name: string | null } | null;
  action: string;
  resource: string;
  resource_id: string | null;
  created_at: string;
}

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminActivityPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filter, setFilter] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-ops-activity", page, pageSize],
    queryFn: async () => (await api.get<{ data: { list: Activity[]; total: number; page: number; pageSize: number } }>("/admin/ops/activity", {
      params: { page, pageSize },
    })).data.data,
    retry: 0,
  });

  const activities = listQ.data?.list ?? [];
  const filtered = filter
    ? activities.filter((x) => (x.action ?? "").toLowerCase().includes(filter.toLowerCase()) || (x.resource ?? "").toLowerCase().includes(filter.toLowerCase()))
    : activities;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>
        实时活动流
        <HelpIcon text="运维操作活动流 — 基于审计日志（audit_logs）实时展示最近的管理员操作：操作者、动作、资源与时间。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="按操作/资源过滤..."
          style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 13, width: 220 }}
        />
        <button onClick={() => qc.invalidateQueries({ queryKey: ["admin-ops-activity"] })} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, background: "var(--color-panel)", cursor: "pointer", fontSize: 13 }}>刷新</button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>共 {listQ.data?.total ?? 0} 条操作记录</span>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {listQ.isLoading ? (
          <p style={{ padding: 20, color: "#94a3b8" }}>加载中...</p>
        ) : listQ.isError ? (
          <p style={{ padding: 20, color: "var(--color-danger-text)" }}>加载失败：{extractError(listQ.error)}</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="暂无操作记录" description="管理员操作审计日志将显示在此处" icon="📋" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--color-bg)", borderBottom: `1px solid var(--color-border)` }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>时间</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>操作者</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>操作</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>资源</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>资源 ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={a.id} style={{ borderBottom: `1px solid var(--color-border)`, background: i % 2 === 0 ? "var(--color-panel)" : "#fafafa" }}>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{a.created_at ? new Date(a.created_at).toLocaleString("zh-CN") : "—"}</td>
                  <td style={{ padding: "10px 16px" }}>{a.user?.name ?? a.user?.email ?? (a.user_id != null ? `用户 #${a.user_id}` : "系统")}</td>
                  <td style={{ padding: "10px 16px", fontWeight: 600 }}>{a.action}</td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)" }}>{a.resource}</td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)" }}>{a.resource_id ?? "—"}</td>
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
    </div>
  );
}

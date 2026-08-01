import { useState, useEffect } from "react";
import { api } from "../lib/api";

/**
 * §30 权限审计日志 —— 记录角色变更/用户分配等操作
 */
interface AuditLog {
  id: number; action: string; operator_id: number | null; target_user_id: number | null; target_role_id: number | null;
  detail: string | null; diff: string | null; operator_email: string | null; target_email: string | null; created_at: string;
}

export default function AdminPermissionAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [help, setHelp] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (actionFilter) params.set("action", actionFilter);
    api.get<{ data: { list: AuditLog[]; pagination: { total: number } } }>("/admin/permission-audit-logs?" + params.toString())
      .then(r => {
        setLogs(r.data.data.list);
        setTotal(r.data.data.pagination.total);
      });
  }, [page, actionFilter]);

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📋</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>权限审计日志
          <span style={{ cursor: "help", fontSize: 14, marginLeft: 8 }} onClick={() => setHelp(!help)}>[?]</span>
        </span>
      </div>
      {help && (
        <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
          <strong>权限审计日志 [?]</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            <li>记录所有角色创建/编辑/删除操作</li>
            <li>记录用户角色分配和移除操作</li>
            <li>可按操作类型筛选，查看操作详情</li>
          </ul>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>操作类型：
          <span style={{ cursor: "help", fontSize: 12, marginLeft: 2, color: "#64748b" }}>[?]</span>
        </label>
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} style={{ padding: "6px", border: "1px solid #ccc", borderRadius: 4 }}>
          <option value="">全部</option>
          <option value="role_created">创建角色</option>
          <option value="role_updated">编辑角色</option>
          <option value="role_deleted">删除角色</option>
          <option value="user_role_assigned">分配角色</option>
          <option value="user_role_removed">移除角色</option>
        </select>
        <span style={{ fontSize: 12, color: "#64748b" }}>共 {total} 条</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>操作</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>操作者</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>目标用户</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>详情</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>时间</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "8px 12px" }}>
                <span style={{ background: actionColor(l.action), color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
                  {actionLabel(l.action)}
                </span>
              </td>
              <td style={{ padding: "8px 12px" }}>{l.operator_email ?? "-"}</td>
              <td style={{ padding: "8px 12px" }}>{l.target_email ?? "-"}</td>
              <td style={{ padding: "8px 12px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.detail ?? ""}>{l.detail ?? "-"}</td>
              <td style={{ padding: "8px 12px", fontSize: 12, color: "#64748b" }}>{l.created_at?.slice(0, 19).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 分页 */}
      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: "4px 12px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: page > 1 ? "pointer" : "default" }}>上一页</button>
          <span style={{ padding: "4px 12px", fontSize: 13 }}>第 {page} / {Math.ceil(total / pageSize)} 页</span>
          <button disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)} style={{ padding: "4px 12px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: page < Math.ceil(total / pageSize) ? "pointer" : "default" }}>下一页</button>
        </div>
      )}
    </div>
  );
}

function actionLabel(a: string): string {
  const map: Record<string, string> = { role_created: "创建角色", role_updated: "编辑角色", role_deleted: "删除角色", user_role_assigned: "分配角色", user_role_removed: "移除角色" };
  return map[a] || a;
}

function actionColor(a: string): string {
  const map: Record<string, string> = { role_created: "#16a34a", role_updated: "#2563eb", role_deleted: "#dc2626", user_role_assigned: "#9333ea", user_role_removed: "#ea580c" };
  return map[a] || "#64748b";
}

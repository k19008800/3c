import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, Pagination } from "@3cloud/shared-ui";

/**
 * §30 权限审计日志 —— 记录角色变更/用户分配等操作
 */
interface AuditLog {
  id: number; action: string; operator_id: number | null; target_user_id: number | null; target_role_id: number | null;
  detail: string | null; diff: string | null; operator_email: string | null; target_email: string | null; created_at: string;
}

/* ───────── 演示数据（后端 /admin/permission-audit-logs 待接入） ───────── */
const MOCK_LOGS: AuditLog[] = [
  { id: 1, action: "role_created", operator_id: 1, target_user_id: null, target_role_id: 5, detail: "创建角色「财务审核员」", diff: null, operator_email: "admin@3cloud.dev", target_email: null, created_at: "2026-08-10T10:00:00" },
  { id: 2, action: "user_role_assigned", operator_id: 1, target_user_id: 1003, target_role_id: 5, detail: "为用户 用户小张 分配角色「财务审核员」", diff: null, operator_email: "admin@3cloud.dev", target_email: "user3@example.com", created_at: "2026-08-10T09:30:00" },
  { id: 3, action: "role_updated", operator_id: 1, target_user_id: null, target_role_id: 2, detail: "编辑角色「客服主管」权限", diff: "+billing:refund", operator_email: "admin@3cloud.dev", target_email: null, created_at: "2026-08-09T16:00:00" },
  { id: 4, action: "user_role_removed", operator_id: 2, target_user_id: 1004, target_role_id: 3, detail: "移除用户 用户小赵 的角色「业务员」", diff: null, operator_email: "ops@3cloud.dev", target_email: "user4@example.com", created_at: "2026-08-08T11:20:00" },
  { id: 5, action: "role_deleted", operator_id: 1, target_user_id: null, target_role_id: 9, detail: "删除角色「临时账号」", diff: null, operator_email: "admin@3cloud.dev", target_email: null, created_at: "2026-08-07T15:45:00" },
];

export default function AdminPermissionAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>(MOCK_LOGS);
  const [total, setTotal] = useState(MOCK_LOGS.length);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [demo, setDemo] = useState(true);
  const pageSize = 20;

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (actionFilter) params.set("action", actionFilter);
    api.get<{ data: { list: AuditLog[]; pagination: { total: number } } }>("/admin/permission-audit-logs?" + params.toString())
      .then(r => {
        setLogs(r.data.data.list);
        setTotal(r.data.data.pagination.total);
        setDemo(false);
      })
      .catch(() => { /* 演示模式保持本地数据 */ });
  }, [page, actionFilter]);

  // 演示模式：本地按操作类型筛选
  const shownLogs = demo ? (actionFilter ? logs.filter(l => l.action === actionFilter) : logs) : logs;
  const shownTotal = demo ? shownLogs.length : total;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>
        权限审计日志
        <HelpIcon text="记录所有角色创建/编辑/删除操作、用户角色分配和移除操作。可按操作类型筛选，查看操作详情。" level="page" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/permission-audit-logs 待接入）</span>}
      </h2>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, marginTop: 16 }}>
        <label style={{ fontSize: 13 }}>操作类型：</label>
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} style={{ padding: "6px", border: `1px solid var(--color-border)`, borderRadius: 4 }}>
          <option value="">全部</option>
          <option value="role_created">创建角色</option>
          <option value="role_updated">编辑角色</option>
          <option value="role_deleted">删除角色</option>
          <option value="user_role_assigned">分配角色</option>
          <option value="user_role_removed">移除角色</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>共 {shownTotal} 条</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--color-bg)" }}>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>操作</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>操作者</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>目标用户</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>详情</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>时间</th>
          </tr>
        </thead>
        <tbody>
          {shownLogs.map(l => (
            <tr key={l.id} style={{ borderBottom: `1px solid var(--color-border)` }}>
              <td style={{ padding: "8px 12px" }}>
                <StatusBadge status={actionStatus(l.action)}>{actionLabel(l.action)}</StatusBadge>
              </td>
              <td style={{ padding: "8px 12px" }}>{l.operator_email ?? "-"}</td>
              <td style={{ padding: "8px 12px" }}>{l.target_email ?? "-"}</td>
              <td style={{ padding: "8px 12px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.detail ?? ""}>{l.detail ?? "-"}</td>
              <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--color-text-secondary)" }}>{l.created_at?.slice(0, 19).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 分页 */}
      {shownTotal > pageSize && (
        <Pagination
          current={page}
          total={shownTotal}
          pageSize={pageSize}
          onChange={(p) => setPage(p)}
        />
      )}
    </div>
  );
}

function actionLabel(a: string): string {
  const map: Record<string, string> = { role_created: "创建角色", role_updated: "编辑角色", role_deleted: "删除角色", user_role_assigned: "分配角色", user_role_removed: "移除角色" };
  return map[a] || a;
}

function actionStatus(a: string): "success" | "warning" | "danger" | "info" | "default" {
  const map: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
    role_created: "success",
    role_updated: "info",
    role_deleted: "danger",
    user_role_assigned: "info",
    user_role_removed: "warning",
  };
  return map[a] || "default";
}

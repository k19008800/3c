import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, Pagination, SkeletonGroup } from "@3cloud/shared-ui";

/**
 * §30 权限审计日志 —— 记录角色变更/用户分配等操作（GET /admin/audit/permissions）
 */
interface AuditLog {
  id: number;
  action: string;
  resource: string | null;
  resource_id: string | null;
  operator_id: number | null;
  operator_email: string | null;
  target_user_id: number | null;
  target_email: string | null;
  target_role_id: number | null;
  detail: string | null;
  diff: string | null;
  ip_address: string | null;
  created_at: string;
}

const PAGE_SIZE = 20;

export default function AdminPermissionAuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");

  const logsQ = useQuery({
    queryKey: ["admin-audit-permissions", page, actionFilter],
    queryFn: async () =>
      (await api.get<{ data: { list: AuditLog[]; pagination: { total: number } } }>(
        `/admin/audit/permissions?page=${page}&page_size=${PAGE_SIZE}&action=${actionFilter}`,
      )).data.data,
    retry: 0,
  });

  const logs = logsQ.data?.list ?? [];
  const total = logsQ.data?.pagination?.total ?? 0;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>
        权限审计日志
        <HelpIcon text="记录所有角色创建/编辑/删除操作、用户角色分配和移除操作。可按操作类型筛选，查看操作详情。" level="page" />
      </h2>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, marginTop: 16 }}>
        <label style={{ fontSize: 13 }}>操作类型：</label>
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} style={{ padding: "6px", border: `1px solid var(--color-border)`, borderRadius: 4 }}>
          <option value="">全部</option>
          <option value="permission">权限相关</option>
          <option value="role">角色相关</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>共 {total} 条</span>
      </div>

      {logsQ.isLoading ? <SkeletonGroup lines={5} /> : (
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
            {logs.map((l: AuditLog) => (
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
            {logs.length === 0 && !logsQ.isLoading && (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无权限审计记录</td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* 分页 */}
      {total > PAGE_SIZE && (
        <Pagination
          current={page}
          total={total}
          pageSize={PAGE_SIZE}
          onChange={(p) => setPage(p)}
        />
      )}
    </div>
  );
}

function actionLabel(a: string): string {
  const map: Record<string, string> = {
    role_created: "创建角色", role_updated: "编辑角色", role_deleted: "删除角色",
    user_role_assigned: "分配角色", user_role_removed: "移除角色",
    "permission.role_assign": "分配角色", "permission.role_remove": "移除角色",
  };
  // 兜底：取 action 最后一段作为展示
  return map[a] || (a.includes(".") ? a.split(".").pop() ?? a : a);
}

function actionStatus(a: string): "success" | "warning" | "danger" | "info" | "default" {
  const map: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
    role_created: "success",
    role_updated: "info",
    role_deleted: "danger",
    user_role_assigned: "info",
    user_role_removed: "warning",
  };
  if (map[a]) return map[a];
  if (a.includes("create") || a.includes("assign")) return "success";
  if (a.includes("delete") || a.includes("remove") || a.includes("reject")) return "danger";
  if (a.includes("update") || a.includes("edit")) return "info";
  return "default";
}

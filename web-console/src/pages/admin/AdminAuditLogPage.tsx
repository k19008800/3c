import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminAuditLogPage() {
  const [keyword, setKeyword] = useState("");
  const [action, setAction] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-audit-logs", keyword, action],
    queryFn: async () => (await api.get(`/admin/audit-logs?keyword=${keyword}&action=${action}&page_size=50`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>操作审计</h2>
        <HelpIcon helpKey="operation_audit" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1, minWidth: 200 }}
          placeholder="搜索操作员/目标..." value={keyword} onChange={e => setKeyword(e.target.value)} />
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={action} onChange={e => setAction(e.target.value)}>
          <option value="">全部操作</option>
          <option value="create">创建</option>
          <option value="update">更新</option>
          <option value="delete">删除</option>
          <option value="audit">审核</option>
          <option value="login">登录</option>
          <option value="export">导出</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📋 操作日志 <HelpIcon helpKey="operation_audit" /></div>
        {listQ.isLoading ? <SkeletonGroup count={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作员</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>目标</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>详情</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>IP</th>
            </tr></thead>
            <tbody>
              {(listQ.data?.list ?? []).map((log: any) => (
                <tr key={log.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{log.created_at}</td>
                  <td style={{ padding: "10px 12px" }}>{log.operator}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4,
                      background: log.action === "delete" ? "#fce4ec" : log.action === "create" ? "#e8f5e9" : "#e8f4fd",
                      color: log.action === "delete" ? "#c62828" : log.action === "create" ? "#2e7d32" : "#1976d2", fontSize: 11 }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{log.target ?? "—"}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {log.detail ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12, fontFamily: "monospace" }}>{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

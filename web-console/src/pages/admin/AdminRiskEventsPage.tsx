import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminRiskEventsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-risk-events", status, keyword],
    queryFn: async () => (await api.get(`/admin/risk/events?status=${status}&keyword=${keyword}&page_size=50`)).data.data,
  });

  const handleMut = useMutation({
    mutationFn: async ({ id, op, reason }: { id: number; op: string; reason?: string }) =>
      (await api.post(`/admin/risk/events/${id}/${op}`, { reason })).data,
    onSuccess: () => { toast.success("已处理"); qc.invalidateQueries({ queryKey: ["admin-risk-events"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>风控事件管理</h2>
        <HelpIcon text="risk_events" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索用户/规则..." value={keyword} onChange={e => setKeyword(e.target.value)} />
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="handled">已处理</option>
          <option value="blocked">已冻结</option>
          <option value="ignored">已忽略</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📋 风控事件列表 <HelpIcon text="risk_events" /></div>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>ID</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>用户</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>规则</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>详情</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>严重度</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(listQ.data?.list ?? []).map((e: any) => (
                <tr key={e.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888" }}>#{e.id}</td>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{e.created_at}</td>
                  <td style={{ padding: "10px 12px" }}>{e.user_email}</td>
                  <td style={{ padding: "10px 12px" }}>{e.rule_name}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{e.detail}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={e.severity === "high" ? "danger" : e.severity === "medium" ? "warning" : "info"}>
                      {({ high: "高", medium: "中", low: "低" } as Record<string, string>)[e.severity] ?? e.severity}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={e.status === "pending" ? "warning" : e.status === "handled" ? "success" : "danger"}>
                      {({ pending: "待处理", handled: "已处理", blocked: "已冻结", ignored: "已忽略" } as Record<string, string>)[e.status] ?? e.status}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                    {e.status === "pending" && (
                      <>
                        <button style={{ ...btnBase, background: "#22c55e", color: "#fff", fontSize: 12 }} onClick={() => handleMut.mutate({ id: e.id, op: "resolve" })}>处理</button>
                        <button style={{ ...btnBase, background: "#e53935", color: "#fff", fontSize: 12 }} onClick={() => handleMut.mutate({ id: e.id, op: "freeze" })}>冻结</button>
                        <button style={{ ...btnBase, background: "#f0f0f0", fontSize: 12 }} onClick={() => handleMut.mutate({ id: e.id, op: "ignore" })}>忽略</button>
                      </>
                    )}
                    {e.status !== "pending" && <span style={{ fontSize: 11, color: "#888" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

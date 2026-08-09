import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminConsumptionAnomalyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [severity, setSeverity] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-consumption-anomalies", severity],
    queryFn: async () => (await api.get(`/admin/consumption/anomalies?severity=${severity}&page_size=50`)).data.data,
  });

  const handleMut = useMutation({
    mutationFn: async ({ id, op }: { id: number; op: string }) =>
      (await api.post(`/admin/consumption/anomalies/${id}/${op}`, {})).data,
    onSuccess: () => { toast.success("已处理"); qc.invalidateQueries({ queryKey: ["admin-consumption-anomalies"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>消费异常提醒</h2>
        <HelpIcon text="consumption_anomaly" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "🚨", label: "严重异常", value: listQ.data?.summary?.critical ?? "—", color: "#e53935" },
          { icon: "⚠️", label: "警告", value: listQ.data?.summary?.warning ?? "—", color: "#f59e0b" },
          { icon: "ℹ️", label: "提醒", value: listQ.data?.summary?.info ?? "—", color: "#4f6ef7" },
          { icon: "✅", label: "已处理", value: listQ.data?.summary?.resolved ?? "—", color: "#22c55e" },
        ].map((s, i) => (
          <div key={i} style={{ ...card, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={severity} onChange={e => setSeverity(e.target.value)}>
          <option value="">全部级别</option>
          <option value="critical">严重</option>
          <option value="warning">警告</option>
          <option value="info">提醒</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>⚠️ 异常列表 <HelpIcon text="consumption_anomaly" /></div>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>用户</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>异常类型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>金额</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>级别</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(listQ.data?.list ?? []).map((a: any) => (
                <tr key={a.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{a.created_at}</td>
                  <td style={{ padding: "10px 12px" }}>{a.user_email}</td>
                  <td style={{ padding: "10px 12px" }}>{a.anomaly_type}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>¥{a.amount}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "info"}>
                      {({ critical: "严重", warning: "警告", info: "提醒" } as Record<string, string>)[a.severity] ?? a.severity}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={a.status === "pending" ? "warning" : "success"}>
                      {({ pending: "待处理", resolved: "已处理", ignored: "已忽略" } as Record<string, string>)[a.status] ?? a.status}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                    {a.status === "pending" && (
                      <>
                        <button style={{ ...btnBase, background: "#22c55e", color: "#fff", fontSize: 12 }} onClick={() => handleMut.mutate({ id: a.id, op: "resolve" })}>处理</button>
                        <button style={{ ...btnBase, background: "#f0f0f0", fontSize: 12 }} onClick={() => handleMut.mutate({ id: a.id, op: "ignore" })}>忽略</button>
                      </>
                    )}
                    {a.status !== "pending" && <span style={{ fontSize: 11, color: "#888" }}>—</span>}
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

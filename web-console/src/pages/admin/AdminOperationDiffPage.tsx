import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminOperationDiffPage() {
  const [type, setType] = useState("");

  const diffQ = useQuery({
    queryKey: ["admin-operation-diff", type],
    queryFn: async () => (await api.get(`/admin/operation/diff?type=${type}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>操作差异</h2>
        <HelpIcon helpKey="operation_diff" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={type} onChange={e => setType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="audit">审核差异</option>
          <option value="finance">财务差异</option>
          <option value="customer">客户差异</option>
          <option value="config">配置差异</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🔄 操作差异记录 <HelpIcon helpKey="operation_diff" /></div>
        {diffQ.isLoading ? <SkeletonGroup count={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>类型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作员</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>差异描述</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>原值</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>新值</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
            </tr></thead>
            <tbody>
              {(diffQ.data?.list ?? []).map((d: any) => (
                <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{d.created_at}</td>
                  <td style={{ padding: "10px 12px" }}>{d.type}</td>
                  <td style={{ padding: "10px 12px" }}>{d.operator}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{d.description}</td>
                  <td style={{ padding: "10px 12px", color: "#e53935" }}>{d.old_value}</td>
                  <td style={{ padding: "10px 12px", color: "#22c55e" }}>{d.new_value}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11,
                      background: d.status === "resolved" ? "#e8f5e9" : "#fff8e1",
                      color: d.status === "resolved" ? "#2e7d32" : "#e65100" }}>
                      {{ pending: "待处理", resolved: "已解决", ignored: "已忽略" }[d.status] ?? d.status}
                    </span>
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

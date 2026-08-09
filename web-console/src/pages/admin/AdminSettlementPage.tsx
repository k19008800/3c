import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminSettlementPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [period, setPeriod] = useState("month");
  const [status, setStatus] = useState("");

  const settleQ = useQuery({
    queryKey: ["admin-settlements", period, status],
    queryFn: async () => (await api.get(`/admin/settlements?period=${period}&status=${status}`)).data.data,
  });

  const settleMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/settlements/${id}/settle`, {})).data,
    onSuccess: () => { toast.success("结算完成"); qc.invalidateQueries({ queryKey: ["admin-settlements"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>结算对账</h2>
        <HelpIcon text="settlement" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        {["week", "month", "quarter"].map(p => (
          <button key={p} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: period === p ? "#4f6ef7" : "#fff", color: period === p ? "#fff" : "#333", cursor: "pointer", fontSize: 13 }}
            onClick={() => setPeriod(p)}>
            {{ week: "本周", month: "本月", quarter: "本季" }[p]}
          </button>
        ))}
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="pending">待结算</option>
          <option value="settled">已结算</option>
          <option value="disputed">有争议</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "💰", label: "待结算总额", value: settleQ.data?.summary?.pending_total != null ? `¥${settleQ.data.summary.pending_total}` : "—", color: "#f59e0b" },
          { icon: "✅", label: "已结算总额", value: settleQ.data?.summary?.settled_total != null ? `¥${settleQ.data.summary.settled_total}` : "—", color: "#22c55e" },
          { icon: "🔌", label: "待结算供应商", value: settleQ.data?.summary?.pending_vendors ?? "—" },
          { icon: "⚠️", label: "有争议笔数", value: settleQ.data?.summary?.disputed ?? "—", color: "#e53935" },
        ].map((s, i) => (
          <div key={i} style={{ ...card, borderLeft: s.color ? `4px solid ${s.color}` : undefined }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>⚖️ 结算列表 <HelpIcon text="settlement" /></div>
        {settleQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>周期</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>消费总额</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>成本</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>利润</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(settleQ.data?.list ?? []).map((s: any) => (
                <tr key={s.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{s.vendor_name}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{s.period}</td>
                  <td style={{ padding: "10px 12px" }}>¥{s.revenue}</td>
                  <td style={{ padding: "10px 12px" }}>¥{s.cost}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: s.profit >= 0 ? "#22c55e" : "#e53935" }}>
                    ¥{s.profit}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={s.status === "settled" ? "success" : s.status === "pending" ? "warning" : "danger"}>
                      {({ pending: "待结算", settled: "已结算", disputed: "有争议" } as Record<string, string>)[s.status] ?? s.status}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {s.status === "pending" && (
                      <button style={{ ...btnBase, background: "#22c55e", color: "#fff", fontSize: 12 }}
                        onClick={() => settleMut.mutate(s.id)}>结算</button>
                    )}
                    {s.status !== "pending" && <span style={{ fontSize: 11, color: "#888" }}>—</span>}
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

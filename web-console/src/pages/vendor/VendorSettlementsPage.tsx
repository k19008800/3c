import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vendorApi } from "../../lib/vendor-api";

interface Settlement {
  id: number; period: string; total_calls: number; success_calls: number; failed_calls: number; total_tokens: number;
  total_cost: number; user_revenue: number; commission_rate: string; commission_amount: number; settlement_amount: number;
  status: string; dispute_reason: string | null; generated_at: string | null; confirmed_at: string | null; paid_at: string | null; payment_reference: string | null;
}
interface SettlementDetail { model_items: { model: string; calls: number; tokens: number; cost: number }[] }

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#f1f5f9", color: "#475569" },
  generated: { bg: "#dbeafe", color: "#1e40af" },
  confirmed: { bg: "#dcfce7", color: "#166534" },
  disputed: { bg: "#fef3c7", color: "#92400e" },
  paid: { bg: "#e2e8f0", color: "#064e3b" },
};

export default function VendorSettlementsPage() {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<{ id: number; period: string } | null>(null);
  const [dispute, setDispute] = useState<{ id: number; reason: string } | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["vendor-settlements"],
    queryFn: async () => (await vendorApi.get<{ list: Settlement[] }>("/vendor/settlements")).list,
  });
  const detailQ = useQuery({
    queryKey: ["vendor-settlement-detail", detail?.id],
    queryFn: async () => (await vendorApi.get<SettlementDetail>(`/vendor/settlements/${detail?.id}`)),
    enabled: !!detail,
  });
  const disputeMut = useMutation({
    mutationFn: async () => vendorApi.post(`/vendor/settlements/${dispute!.id}/dispute`, { reason: dispute!.reason }),
    onSuccess: () => { setNotice({ type: "success", msg: "争议已发起，平台将处理" }); setDispute(null); qc.invalidateQueries({ queryKey: ["vendor-settlements"] }); },
    onError: (e: any) => setNotice({ type: "error", msg: e?.message ?? "发起失败" }),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>结算对账</h2>
      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.length ?? 0) === 0 ? <div style={{ color: "#94a3b8", padding: 30, textAlign: "center" }}>暂无结算单</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "8px" }}>周期</th><th style={{ padding: "8px" }}>调用</th><th style={{ padding: "8px" }}>用户消费</th><th style={{ padding: "8px" }}>佣金</th><th style={{ padding: "8px" }}>应结算</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>操作</th></tr></thead>
            <tbody>
              {listQ.data?.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{s.period}</td>
                  <td style={{ padding: "8px" }}>{s.total_calls}</td>
                  <td style={{ padding: "8px" }}>¥{Number(s.user_revenue).toFixed(4)}</td>
                  <td style={{ padding: "8px" }}>¥{Number(s.commission_amount).toFixed(4)}</td>
                  <td style={{ padding: "8px", fontWeight: 600, color: "#166534" }}>¥{Number(s.settlement_amount).toFixed(4)}</td>
                  <td style={{ padding: "8px" }}><span style={{ ...(STATUS_STYLE[s.status] ?? STATUS_STYLE.pending), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{s.status}</span></td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setDetail({ id: s.id, period: s.period })} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>明细</button>
                    {s.status === "generated" && <button onClick={() => setDispute({ id: s.id, reason: "" })} style={{ ...btnBase, background: "#fef3c7", color: "#92400e", padding: "4px 10px", marginLeft: 6 }}>争议</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 明细弹窗 */}
      {detail && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 560, maxHeight: "80vh", overflow: "auto" }}>
            <h3 style={{ marginBottom: 4 }}>结算明细 · {detail.period}</h3>
            {detailQ.isLoading ? <div style={{ color: "#94a3b8", padding: 20, textAlign: "center" }}>加载中...</div> : (detailQ.data?.model_items?.length ?? 0) === 0 ? <div style={{ color: "#94a3b8", padding: 20, textAlign: "center" }}>该周期无调用记录</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "6px" }}>模型</th><th style={{ padding: "6px" }}>调用</th><th style={{ padding: "6px" }}>Tokens</th><th style={{ padding: "6px" }}>成本</th></tr></thead>
                <tbody>
                  {(detailQ.data?.model_items ?? []).map((m) => (
                    <tr key={m.model} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px", fontWeight: 600 }}>{m.model}</td>
                      <td style={{ padding: "6px" }}>{m.calls}</td>
                      <td style={{ padding: "6px" }}>{m.tokens.toLocaleString()}</td>
                      <td style={{ padding: "6px" }}>¥{m.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 16, textAlign: "right" }}><button onClick={() => setDetail(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button></div>
          </div>
        </div>
      )}

      {/* 争议弹窗 */}
      {dispute && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 420 }}>
            <h3 style={{ marginBottom: 16 }}>发起争议</h3>
            <textarea value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })} placeholder="争议原因（如有金额差异请说明）" rows={4} style={{ width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, resize: "vertical", fontFamily: "inherit", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDispute(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => disputeMut.mutate()} style={{ ...btnBase, background: "#d97706", color: "#fff" }}>确认争议</button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

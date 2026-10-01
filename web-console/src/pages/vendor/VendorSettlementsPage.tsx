import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vendorApi } from "../../lib/vendor-api";
import "../console-misc.css";

interface Settlement {
  id: number; period: string; total_calls: number; success_calls: number; failed_calls: number; total_tokens: number;
  total_cost: number; user_revenue: number; commission_rate: string; commission_amount: number; settlement_amount: number;
  status: string; dispute_reason: string | null; generated_at: string | null; confirmed_at: string | null; paid_at: string | null; payment_reference: string | null;
}
interface SettlementDetail { model_items: { model: string; calls: number; tokens: number; cost: number }[] }

const card = { background: "var(--color-panel)", border: "1px solid var(--color-divider)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "var(--color-divider-light)", color: "var(--color-text-secondary)" },
  generated: { bg: "var(--color-info-bg)", color: "var(--color-info-text)" },
  confirmed: { bg: "var(--color-success-bg)", color: "var(--color-success-text)" },
  disputed: { bg: "var(--color-warning-bg)", color: "var(--color-warning-text)" },
  paid: { bg: "var(--color-success-bg)", color: "var(--color-success-text)" },
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
    <div>
      <h2 style={{ marginBottom: 20, color: "var(--color-text)" }}>结算对账</h2>
      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "var(--color-text-muted)" }}>加载中...</div> : (listQ.data?.length ?? 0) === 0 ? <div style={{ color: "var(--color-text-muted)", padding: 30, textAlign: "center" }}>暂无结算单</div> : (
          <table className="cm-table">
            <thead><tr><th>周期</th><th className="num">调用</th><th className="num">用户消费</th><th className="num">佣金</th><th className="num">应结算</th><th style={{textAlign:"center"}}>状态</th><th>操作</th></tr></thead>
            <tbody>
              {listQ.data?.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.period}</td>
                  <td className="num">{s.total_calls}</td>
                  <td className="num">¥{Number(s.user_revenue).toFixed(4)}</td>
                  <td className="num">¥{Number(s.commission_amount).toFixed(4)}</td>
                  <td className="num" style={{ fontWeight: 600, color: "var(--color-success-text)" }}>¥{Number(s.settlement_amount).toFixed(4)}</td>
                  <td style={{ textAlign: "center" }}><span style={{ ...(STATUS_STYLE[s.status] ?? STATUS_STYLE.pending), padding: "2px 10px", borderRadius: "var(--radius-pill)", fontSize: 12 }}>{s.status}</span></td>
                  <td>
                    <button onClick={() => setDetail({ id: s.id, period: s.period })} style={{ ...btnBase, background: "var(--color-divider-light)", color: "var(--color-text)", padding: "4px 10px" }}>明细</button>
                    {s.status === "generated" && <button onClick={() => setDispute({ id: s.id, reason: "" })} style={{ ...btnBase, background: "var(--color-warning-bg)", color: "var(--color-warning-text)", padding: "4px 10px", marginLeft: 6 }}>争议</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 明细弹窗 */}
      {detail && (
        <div style={{ position: "fixed", inset: 0, background: "var(--color-modal-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "var(--z-modal)" }}>
          <div style={{ ...card, width: 560, maxWidth: "calc(100vw - 40px)", maxHeight: "80vh", overflow: "auto" }}>
            <h3 style={{ marginBottom: 4, color: "var(--color-text)" }}>结算明细 · {detail.period}</h3>
            {detailQ.isLoading ? <div style={{ color: "var(--color-text-muted)", padding: 20, textAlign: "center" }}>加载中...</div> : (detailQ.data?.model_items?.length ?? 0) === 0 ? <div style={{ color: "var(--color-text-muted)", padding: 20, textAlign: "center" }}>该周期无调用记录</div> : (
              <table className="cm-table" style={{ marginTop: 8 }}>
                <thead><tr><th>模型</th><th className="num">调用</th><th className="num">Tokens</th><th className="num">成本</th></tr></thead>
                <tbody>
                  {(detailQ.data?.model_items ?? []).map((m) => (
                    <tr key={m.model}>
                      <td style={{ fontWeight: 600 }}>{m.model}</td>
                      <td className="num">{m.calls}</td>
                      <td className="num">{m.tokens.toLocaleString()}</td>
                      <td className="num">¥{m.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 16, textAlign: "right" }}><button onClick={() => setDetail(null)} style={{ ...btnBase, background: "var(--color-divider-light)", color: "var(--color-text)" }}>关闭</button></div>
          </div>
        </div>
      )}

      {/* 争议弹窗 */}
      {dispute && (
        <div style={{ position: "fixed", inset: 0, background: "var(--color-modal-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "var(--z-modal)" }}>
          <div style={{ ...card, width: 420, maxWidth: "calc(100vw - 40px)" }}>
            <h3 style={{ marginBottom: 16, color: "var(--color-text)" }}>发起争议</h3>
            <textarea value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })} placeholder="争议原因（如有金额差异请说明）" rows={4} style={{ width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", resize: "vertical", fontFamily: "inherit", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDispute(null)} style={{ ...btnBase, background: "var(--color-divider-light)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => disputeMut.mutate()} style={{ ...btnBase, background: "var(--color-warning-text)", color: "#fff" }}>确认争议</button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: "var(--z-toast)", padding: "12px 20px", borderRadius: "var(--radius-md)", color: "#fff", background: notice.type === "success" ? "var(--color-success-text)" : "var(--color-danger-text)", boxShadow: "var(--shadow-toast)" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

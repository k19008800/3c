import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface ModelItem {
  model: string; calls: number; success: number; failed: number; tokens: number; cost: number; revenue: number;
}

interface Settlement {
  id: number; vendor_id: number; vendor_name: string; period: string;
  total_calls: number; success_calls: number; failed_calls: number; total_tokens: number;
  total_cost: number; user_revenue: number; commission_rate: string | number;
  commission_amount: number; settlement_amount: number;
  status: string; status_label: string; dispute_reason: string | null;
  generated_at: string | null; confirmed_at: string | null; paid_at: string | null;
  payment_reference: string | null;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#f1f5f9", color: "#475569" },
  generated: { bg: "#dbeafe", color: "#1e40af" },
  confirmed: { bg: "#dcfce7", color: "#166534" },
  disputed: { bg: "#fef3c7", color: "#92400e" },
  paid: { bg: "#e2e8f0", color: "#064e3b" },
};
const FILTERS = [{ value: "", label: "全部" }, { value: "generated", label: "已生成" }, { value: "confirmed", label: "已确认" }, { value: "disputed", label: "争议中" }, { value: "paid", label: "已打款" }];

export default function AdminVendorSettlementsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [showGen, setShowGen] = useState(false);
  const [genForm, setGenForm] = useState({ vendor_id: "", period: "", commission_rate: "0.1" });
  const [dispute, setDispute] = useState<{ id: number; reason: string } | null>(null);
  const [detail, setDetail] = useState<{ id: number; vendor_name: string; period: string; items: ModelItem[] } | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-vendor-settlements", status],
    queryFn: async () => (await api.get<{ data: { list: Settlement[] } }>(`/admin/vendor-settlements?status=${status}&page_size=50`)).data.data,
  });

  const genMut = useMutation({
    mutationFn: async () => (await api.post("/admin/vendor-settlements/generate", { vendor_id: Number(genForm.vendor_id), period: genForm.period, commission_rate: Number(genForm.commission_rate) })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已生成" }); setShowGen(false); qc.invalidateQueries({ queryKey: ["admin-vendor-settlements"] }); },
    onError: (e) => { setNotice({ type: "error", msg: extractError(e) }); setShowGen(false); qc.invalidateQueries({ queryKey: ["admin-vendor-settlements"] }); },
  });
  const opMut = useMutation({
    mutationFn: async ({ id, op, body }: { id: number; op: string; body?: any }) => (await api.post(`/admin/vendor-settlements/${id}/${op}`, body ?? {})).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "操作成功" }); setDispute(null); qc.invalidateQueries({ queryKey: ["admin-vendor-settlements"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const detailQ = useQuery({
    queryKey: ["admin-vendor-settlements-detail", detail?.id],
    queryFn: async () => (await api.get<{ data: { model_items?: ModelItem[]; vendor_name: string; period: string } }>(`/admin/vendor-settlements/${detail?.id}`)).data.data,
    enabled: !!detail,
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>供应商结算</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map(f => <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "#2563eb" : "#fff", color: status === f.value ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>{f.label}</button>)}
        <button onClick={() => setShowGen(true)} style={{ ...btnBase, background: "#2563eb", color: "#fff", marginLeft: "auto" }}>+ 生成结算单</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? <div style={{ color: "#94a3b8" }}>暂无结算单</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ color: "#64748b", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>供应商</th><th style={{ padding: "8px" }}>周期</th><th style={{ padding: "8px" }}>调用</th>
              <th style={{ padding: "8px" }}>用户消费</th><th style={{ padding: "8px" }}>应结算</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>操作</th>
            </tr></thead>
            <tbody>
              {listQ.data?.list.map(s => (
                <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{s.vendor_name}</td>
                  <td style={{ padding: "8px" }}>{s.period}</td>
                  <td style={{ padding: "8px" }}>{s.total_calls}</td>
                  <td style={{ padding: "8px" }}>¥{s.user_revenue.toLocaleString()}</td>
                  <td style={{ padding: "8px", fontWeight: 600, color: "#166534" }}>¥{s.settlement_amount.toLocaleString()}</td>
                  <td style={{ padding: "8px" }}><span style={{ ...(STATUS_STYLE[s.status] ?? STATUS_STYLE.pending), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{s.status_label}</span></td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setDetail({ id: s.id, vendor_name: s.vendor_name, period: s.period, items: [] })} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px", marginRight: 6 }}>明细</button>
                    {s.status === "generated" && (<><button onClick={() => opMut.mutate({ id: s.id, op: "confirm" })} style={{ ...btnBase, background: "#16a34a", color: "#fff", padding: "4px 10px" }}>确认</button><button onClick={() => setDispute({ id: s.id, reason: "" })} style={{ ...btnBase, background: "#fef3c7", color: "#92400e", padding: "4px 10px", marginLeft: 6 }}>争议</button></>)}
                    {s.status === "confirmed" && <button onClick={() => opMut.mutate({ id: s.id, op: "paid", body: { payment_reference: `TF${Date.now()}` } })} style={{ ...btnBase, background: "#064e3b", color: "#fff", padding: "4px 10px" }}>标记打款</button>}
                    {s.status === "disputed" && <button onClick={() => opMut.mutate({ id: s.id, op: "confirm" })} style={{ ...btnBase, background: "#16a34a", color: "#fff", padding: "4px 10px" }}>解决争议确认</button>}
                    {s.status === "pending" && <span style={{ fontSize: 12, color: "#94a3b8" }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 生成弹窗 */}
      {showGen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 400 }}>
            <h3 style={{ marginBottom: 16 }}>生成结算单</h3>
            <input value={genForm.vendor_id} onChange={(e) => setGenForm({ ...genForm, vendor_id: e.target.value })} placeholder="供应商 ID (如 6)" type="number" style={inp} />
            <input value={genForm.period} onChange={(e) => setGenForm({ ...genForm, period: e.target.value })} placeholder="周期 YYYY-MM (如 2026-07)" style={inp} />
            <input value={genForm.commission_rate} onChange={(e) => setGenForm({ ...genForm, commission_rate: e.target.value })} placeholder="平台佣金率 (如 0.1)" type="number" step="0.01" style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowGen(false)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => genMut.mutate()} disabled={!genForm.vendor_id || !genForm.period} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>{genMut.isPending ? "生成中..." : "生成"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 模型明细弹窗 */}
      {detail && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 720, maxHeight: "80vh", overflow: "auto" }}>
            <h3 style={{ marginBottom: 4 }}>{detail.vendor_name} · {detail.period} 模型明细</h3>
            {detailQ.isLoading ? (
              <div style={{ color: "#94a3b8", padding: 30, textAlign: "center" }}>加载中...</div>
            ) : (detailQ.data?.model_items?.length ?? 0) === 0 ? (
              <div style={{ color: "#94a3b8", padding: 30, textAlign: "center" }}>该周期无模型调用记录</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                <thead>
                  <tr style={{ color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: "6px" }}>模型</th>
                    <th style={{ padding: "6px" }}>调用</th>
                    <th style={{ padding: "6px" }}>成功/失败</th>
                    <th style={{ padding: "6px" }}>Tokens</th>
                    <th style={{ padding: "6px" }}>成本</th>
                    <th style={{ padding: "6px" }}>用户收入</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailQ.data?.model_items ?? []).map((it) => (
                    <tr key={it.model} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px", fontWeight: 600 }}>{it.model}</td>
                      <td style={{ padding: "6px" }}>{it.calls}</td>
                      <td style={{ padding: "6px", color: "#64748b" }}>{it.success} / {it.failed}</td>
                      <td style={{ padding: "6px" }}>{it.tokens.toLocaleString()}</td>
                      <td style={{ padding: "6px" }}>¥{it.cost.toFixed(4)}</td>
                      <td style={{ padding: "6px" }}>¥{it.revenue.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setDetail(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 争议弹窗 */}
      {dispute && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 400 }}>
            <h3 style={{ marginBottom: 16 }}>标记争议</h3>
            <textarea value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })} placeholder="争议原因" rows={3} style={{ ...inp, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDispute(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => opMut.mutate({ id: dispute.id, op: "dispute", body: { reason: dispute.reason } })} style={{ ...btnBase, background: "#d97706", color: "#fff" }}>确认争议</button>
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

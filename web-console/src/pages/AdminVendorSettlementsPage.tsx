import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

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

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "default",
  generated: "info",
  confirmed: "success",
  disputed: "warning",
  paid: "success",
};
const FILTERS = [{ value: "", label: "全部" }, { value: "generated", label: "已生成" }, { value: "confirmed", label: "已确认" }, { value: "disputed", label: "争议中" }, { value: "paid", label: "已打款" }];

export default function AdminVendorSettlementsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [showGen, setShowGen] = useState(false);
  const [genForm, setGenForm] = useState({ vendor_id: "", period: "", commission_rate: "0.1" });
  const [dispute, setDispute] = useState<{ id: number; reason: string } | null>(null);
  const [detail, setDetail] = useState<{ id: number; vendor_name: string; period: string; items: ModelItem[] } | null>(null);
  const { toast } = useToast();

  const listQ = useQuery({
    queryKey: ["admin-vendor-settlements", status],
    queryFn: async () => (await api.get<{ data: { list: Settlement[] } }>(`/admin/vendor-settlements?status=${status}&page_size=50`)).data.data,
  });

  const genMut = useMutation({
    mutationFn: async () => (await api.post("/admin/vendor-settlements/generate", { vendor_id: Number(genForm.vendor_id), period: genForm.period, commission_rate: Number(genForm.commission_rate) })).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已生成"); setShowGen(false); qc.invalidateQueries({ queryKey: ["admin-vendor-settlements"] }); },
    onError: (e) => { toast.error(extractError(e)); setShowGen(false); qc.invalidateQueries({ queryKey: ["admin-vendor-settlements"] }); },
  });
  const opMut = useMutation({
    mutationFn: async ({ id, op, body }: { id: number; op: string; body?: any }) => (await api.post(`/admin/vendor-settlements/${id}/${op}`, body ?? {})).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "操作成功"); setDispute(null); qc.invalidateQueries({ queryKey: ["admin-vendor-settlements"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  const detailQ = useQuery({
    queryKey: ["admin-vendor-settlements-detail", detail?.id],
    queryFn: async () => (await api.get<{ data: { model_items?: ModelItem[]; vendor_name: string; period: string } }>(`/admin/vendor-settlements/${detail?.id}`)).data.data,
    enabled: !!detail,
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        供应商结算
        <HelpIcon text="管理供应商结算单的生成、确认、争议处理与打款。按供应商和周期生成结算单，支持模型级别明细查看。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map(f => <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "var(--color-primary)" : "var(--color-panel)", color: status === f.value ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>{f.label}</button>)}
        <button onClick={() => setShowGen(true)} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", marginLeft: "auto" }}>+ 生成结算单</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (listQ.data?.list?.length ?? 0) === 0 ? <EmptyState title="暂无结算单" /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>供应商</th><th style={{ padding: "8px" }}>周期</th><th style={{ padding: "8px" }}>调用</th>
              <th style={{ padding: "8px" }}>用户消费</th><th style={{ padding: "8px" }}>应结算</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>操作</th>
            </tr></thead>
            <tbody>
              {listQ.data?.list.map(s => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{s.vendor_name}</td>
                  <td style={{ padding: "8px" }}>{s.period}</td>
                  <td style={{ padding: "8px" }}>{s.total_calls}</td>
                  <td style={{ padding: "8px" }}>¥{s.user_revenue.toLocaleString()}</td>
                  <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-success-text)" }}>¥{s.settlement_amount.toLocaleString()}</td>
                  <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[s.status] ?? "default"}>{s.status_label}</StatusBadge></td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setDetail({ id: s.id, vendor_name: s.vendor_name, period: s.period, items: [] })} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", padding: "4px 10px", marginRight: 6 }}>明细</button>
                    {s.status === "generated" && (<><button onClick={() => opMut.mutate({ id: s.id, op: "confirm" })} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff", padding: "4px 10px" }}>确认</button><button onClick={() => setDispute({ id: s.id, reason: "" })} style={{ ...btnBase, background: "var(--color-warning-bg)", color: "var(--color-warning-text)", padding: "4px 10px", marginLeft: 6 }}>争议</button></>)}
                    {s.status === "confirmed" && <button onClick={() => opMut.mutate({ id: s.id, op: "paid", body: { payment_reference: `TF${Date.now()}` } })} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff", padding: "4px 10px" }}>标记打款</button>}
                    {s.status === "disputed" && <button onClick={() => opMut.mutate({ id: s.id, op: "confirm" })} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff", padding: "4px 10px" }}>解决争议确认</button>}
                    {s.status === "pending" && <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 生成弹窗 */}
      <Modal open={showGen} onClose={() => setShowGen(false)} title="生成结算单" width={400}>
        <input value={genForm.vendor_id} onChange={(e) => setGenForm({ ...genForm, vendor_id: e.target.value })} placeholder="供应商 ID (如 6)" type="number" style={inp} />
        <input value={genForm.period} onChange={(e) => setGenForm({ ...genForm, period: e.target.value })} placeholder="周期 YYYY-MM (如 2026-07)" style={inp} />
        <input value={genForm.commission_rate} onChange={(e) => setGenForm({ ...genForm, commission_rate: e.target.value })} placeholder="平台佣金率 (如 0.1)" type="number" step="0.01" style={inp} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setShowGen(false)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
          <button onClick={() => genMut.mutate()} disabled={!genForm.vendor_id || !genForm.period} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>{genMut.isPending ? "生成中..." : "生成"}</button>
        </div>
      </Modal>

      {/* 模型明细弹窗 */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`${detail?.vendor_name ?? ""} · ${detail?.period ?? ""} 模型明细`} width={720}>
        {detailQ.isLoading ? (
          <SkeletonGroup lines={3} />
        ) : (detailQ.data?.model_items?.length ?? 0) === 0 ? (
          <EmptyState title="该周期无模型调用记录" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "6px" }}>模型</th><th style={{ padding: "6px" }}>调用</th><th style={{ padding: "6px" }}>成功/失败</th>
                <th style={{ padding: "6px" }}>Tokens</th><th style={{ padding: "6px" }}>成本</th><th style={{ padding: "6px" }}>用户收入</th>
              </tr>
            </thead>
            <tbody>
              {(detailQ.data?.model_items ?? []).map((it) => (
                <tr key={it.model} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "6px", fontWeight: 600 }}>{it.model}</td>
                  <td style={{ padding: "6px" }}>{it.calls}</td>
                  <td style={{ padding: "6px", color: "var(--color-text-secondary)" }}>{it.success} / {it.failed}</td>
                  <td style={{ padding: "6px" }}>{it.tokens.toLocaleString()}</td>
                  <td style={{ padding: "6px" }}>¥{it.cost.toFixed(4)}</td>
                  <td style={{ padding: "6px" }}>¥{it.revenue.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      {/* 争议弹窗 */}
      <Modal open={!!dispute} onClose={() => setDispute(null)} title="标记争议" width={400}>
        {dispute && (
          <>
            <textarea value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })} placeholder="争议原因" rows={3} style={{ ...inp, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDispute(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => opMut.mutate({ id: dispute.id, op: "dispute", body: { reason: dispute.reason } })} style={{ ...btnBase, background: "var(--color-warning-text)", color: "#fff" }}>确认争议</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

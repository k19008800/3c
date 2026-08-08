import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/**
 * 财务 · 资金与对账管理（SPEC-§29）
 * Tab1 资金流水 / Tab2 资金账户 / Tab3 对账差异 / Tab4 结账管理
 */

interface LedgerEntry {
  id: number; serial_no: string; type: string; type_label: string; direction: string;
  amount: number; balance_after: number; user_id: number | null; agent_id: number | null; vendor_id: number | null;
  related_order_no: string | null; external_ref: string | null; payment_channel: string | null;
  status: string; status_label: string; remark: string | null; created_at: string;
}
interface LedgerDetail { serial_no: string; type_label: string; amount: number; balance_after: number; status: string; related_order_no: string | null; external_ref: string | null; payment_channel: string | null; created_at: string; remark: string | null; related: { user?: any; vendor?: any }; }
interface AccountOverview {
  total_balance: number; available_balance: number; frozen_balance: number; frozen_detail: { label: string; amount: number }[];
  user_recharge_total: number; user_consumption_total: number; settled_to_vendor: number; pending_vendor_settlement: number;
  agent_commission_paid: number; agent_commission_pending: number; platform_gross_profit: number; platform_gross_margin: number;
}
interface DiffItem {
  id: number; subject_type: string; subject_id: number; subject_name: string; period: string;
  platform_amount: number; counterparty_amount: number; diff_amount: number; check_type: string;
  status: string; status_label: string; remark: string | null; created_at: string;
}
interface PeriodRow { id: number; period: string; status: string; status_label: string; income_total: number; expense_total: number; gross_profit: number; gross_margin: number; locked_at: string | null; voucher_no: string | null; unlocked_reason: string | null; relock_at: string | null; }

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const LEDGER_STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  completed: "success",
  reversed: "default",
  pending: "warning",
  failed: "danger",
};
const DIFF_STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "danger",
  resolved_platform: "success",
  resolved_counterparty: "info",
  verify: "warning",
  closed: "default",
};

export default function AdminFinancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ledger" | "accounts" | "reconcile" | "close">("ledger");
  const { toast } = useToast();

  const [lType, setLType] = useState("");
  const [lSearch, setLSearch] = useState("");
  const [ledgerDetail, setLedgerDetail] = useState<number | null>(null);
  const [adjust, setAdjust] = useState<{ amount: string; remark: string } | null>(null);
  const [diffStatus, setDiffStatus] = useState("");
  const [reconPeriod, setReconPeriod] = useState("");
  const [closePeriod, setClosePeriod] = useState("");
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [unlock, setUnlock] = useState<{ period: string; reason: string } | null>(null);

  const ledQ = useQuery({
    queryKey: ["finance-ledger", lType, lSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "50" });
      if (lType) params.set("type", lType);
      if (lSearch) params.set("search", lSearch);
      return (await api.get<{ data: { list: LedgerEntry[]; summary: { total_in: number; total_out: number; net_flow: number } } }>(`/admin/finance/ledger?${params}`)).data.data;
    },
  });
  const accQ = useQuery({ queryKey: ["finance-accounts"], queryFn: async () => (await api.get<{ data: AccountOverview }>("/admin/finance/accounts")).data.data });
  const trendQ = useQuery({ queryKey: ["finance-trend"], queryFn: async () => (await api.get<{ data: { trend: { date: string; total: number }[] } }>("/admin/finance/accounts/trend?days=30")).data.data });
  const diffQ = useQuery({
    queryKey: ["finance-diffs", diffStatus],
    queryFn: async () => (await api.get<{ data: { list: DiffItem[]; stats: { pending_count: number; pending_amount: number } } }>(`/admin/finance/reconciliation/differences?status=${diffStatus}&page_size=50`)).data.data,
  });
  const closeStatusQ = useQuery({ queryKey: ["finance-close"], queryFn: async () => (await api.get<{ data: { period: string; status: string; status_label: string; record: any } }>("/admin/finance/close/status")).data.data });
  const closeHistQ = useQuery({ queryKey: ["finance-close-hist"], queryFn: async () => (await api.get<{ data: { list: PeriodRow[] } }>("/admin/finance/close/history")).data.data });

  const ledgerDetailQ = useQuery({
    queryKey: ["finance-ledger-detail", ledgerDetail],
    queryFn: async () => (await api.get<{ data: LedgerDetail }>(`/admin/finance/ledger/${encodeURIComponent((ledQ.data?.list.find(x => x.id === ledgerDetail)?.serial_no) ?? "")}`)).data.data,
    enabled: !!ledgerDetail,
  });

  const adjustMut = useMutation({
    mutationFn: async () => (await api.post("/admin/finance/ledger/adjust", { amount: Number(adjust?.amount), remark: adjust?.remark })).data,
    onSuccess: () => { toast.success("调账成功"); setAdjust(null); qc.invalidateQueries({ queryKey: ["finance-ledger"] }); qc.invalidateQueries({ queryKey: ["finance-accounts"] }); qc.invalidateQueries({ queryKey: ["finance-trend"] }); },
    onError: (e) => { toast.error(extractError(e)); setAdjust(null); },
  });
  const reconMut = useMutation({
    mutationFn: async () => (await api.post("/admin/finance/reconciliation/run", { period: reconPeriod })).data,
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "对账完成"); qc.invalidateQueries({ queryKey: ["finance-diffs"] }); },
    onError: (e) => toast.error(extractError(e)),
  });
  const diffResolveMut = useMutation({
    mutationFn: async ({ id, mode }: { id: number; mode: string }) => (await api.post(`/admin/finance/reconciliation/differences/${id}/resolve`, { resolve_mode: mode, remark: "" })).data,
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "已处理"); qc.invalidateQueries({ queryKey: ["finance-diffs"] }); },
    onError: (e) => toast.error(extractError(e)),
  });
  const closeMut = useMutation({
    mutationFn: async (period: string) => (await api.post("/admin/finance/close/execute", { period })).data,
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "结账完成"); setShowCloseConfirm(false); qc.invalidateQueries({ queryKey: ["finance-close"] }); qc.invalidateQueries({ queryKey: ["finance-close-hist"] }); },
    onError: (e) => { toast.error(extractError(e)); setShowCloseConfirm(false); },
  });
  const unlockMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/finance/close/${unlock?.period}/unlock`, { reason: unlock?.reason })).data,
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "已解锁"); setUnlock(null); qc.invalidateQueries({ queryKey: ["finance-close"] }); qc.invalidateQueries({ queryKey: ["finance-close-hist"] }); },
    onError: (e) => { toast.error(extractError(e)); setUnlock(null); },
  });

  const TABS = [
    { key: "ledger", label: "资金流水" }, { key: "accounts", label: "资金账户" },
    { key: "reconcile", label: "对账差异" }, { key: "close", label: "结账管理" },
  ] as const;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        资金与对账管理
        <HelpIcon text="财务模块 · 资金流水/账户/对账/结账。记录平台每一笔资金进出，查看平台资金总览，处理对账差异，管理每月结账。" level="page" />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginTop: 0, fontSize: 13 }}>财务模块 · SPEC-§29</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ ...btnBase, background: tab === t.key ? "var(--color-primary)" : "var(--color-panel)", color: tab === t.key ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ========== Tab1 资金流水 ========== */}
      {tab === "ledger" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select value={lType} onChange={(e) => setLType(e.target.value)} style={{ ...inp, width: 160, marginBottom: 0 }}>
              <option value="">全部类型</option>
              <option value="user_recharge">用户充值</option><option value="user_consumption">用户消费</option>
              <option value="user_refund">平台退款</option><option value="agent_commission">代理佣金</option>
              <option value="agent_withdraw">代理提现</option><option value="vendor_settlement">供应商结算</option>
              <option value="internal_adjust">内部调账</option>
            </select>
            <input value={lSearch} onChange={(e) => setLSearch(e.target.value)} placeholder="搜索流水号/订单号" style={{ ...inp, width: 220, marginBottom: 0 }} />
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)", marginLeft: "auto" }}>
              收入 ¥{ledQ.data?.summary.total_in ?? 0} · 支出 ¥{ledQ.data?.summary.total_out ?? 0} · 净流入 ¥{ledQ.data?.summary.net_flow ?? 0}
            </span>
            <button onClick={() => setAdjust({ amount: "", remark: "" })} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>内部调账</button>
          </div>
          <div style={card}>
            {ledQ.isLoading ? <SkeletonGroup lines={5} /> : (ledQ.data?.list?.length ?? 0) === 0 ? <EmptyState title="暂无流水" /> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>流水号</th><th style={{ padding: "8px" }}>时间</th><th style={{ padding: "8px" }}>类型</th><th style={{ padding: "8px" }}>方向</th>
                <th style={{ padding: "8px" }}>金额</th><th style={{ padding: "8px" }}>余额</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>备注</th>
              </tr></thead><tbody>
                {ledQ.data?.list.map(e => (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--color-border)", cursor: "pointer" }} onClick={() => setLedgerDetail(e.id)}>
                    <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-primary)" }}>{e.serial_no}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{e.created_at?.slice(0, 16)?.replace("T", " ")}</td>
                    <td style={{ padding: "8px" }}>{e.type_label}</td>
                    <td style={{ padding: "8px", color: e.direction === "in" ? "var(--color-success-text)" : "var(--color-danger-text)" }}>{e.direction === "in" ? "收入" : "支出"}</td>
                    <td style={{ padding: "8px", fontWeight: 600, color: e.direction === "in" ? "var(--color-success-text)" : "var(--color-danger-text)" }}>{e.direction === "in" ? "+" : "-"}¥{e.amount.toFixed(4)}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>¥{e.balance_after.toFixed(2)}</td>
                    <td style={{ padding: "8px" }}><StatusBadge status={LEDGER_STATUS_MAP[e.status] ?? "success"}>{e.status_label}</StatusBadge></td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.remark ?? "—"}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
      )}

      {/* ========== Tab2 资金账户 ========== */}
      {tab === "accounts" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 16 }}>
            {[
              { label: "平台总余额", value: accQ.data?.total_balance ?? 0, color: "var(--color-text)" },
              { label: "可用余额", value: accQ.data?.available_balance ?? 0, color: "var(--color-success-text)" },
              { label: "冻结资金", value: accQ.data?.frozen_balance ?? 0, color: "var(--color-warning-text)" },
              { label: "平台毛利", value: accQ.data?.platform_gross_profit ?? 0, color: "var(--color-primary)" },
              { label: "毛利率", value: `${accQ.data?.platform_gross_margin ?? 0}%`, color: "#7c3aed" },
            ].map(c => (
              <div key={c.label} style={card}>
                <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>¥{typeof c.value === "number" ? c.value.toLocaleString() : c.value}</div>
              </div>
            ))}
          </div>
          <div style={{ ...card, marginBottom: 16 }}>
            <h4 style={{ margin: 0, marginBottom: 12 }}>冻结资金明细</h4>
            {(accQ.data?.frozen_detail ?? []).map(f => (
              <div key={f.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
                <span style={{ color: "var(--color-text)" }}>{f.label}</span><strong>¥{f.amount.toLocaleString()}</strong>
              </div>
            ))}
            {(accQ.data?.frozen_detail ?? []).length === 0 && <div style={{ color: "var(--color-text-secondary)" }}>暂无冻结资金</div>}
          </div>
          <div style={{ ...card, marginBottom: 16 }}>
            <h4 style={{ margin: 0, marginBottom: 12 }}>资金构成</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              {[
                ["用户充值总额", accQ.data?.user_recharge_total ?? 0], ["用户消费总额", accQ.data?.user_consumption_total ?? 0],
                ["已结算给供应商", accQ.data?.settled_to_vendor ?? 0], ["待结算给供应商", accQ.data?.pending_vendor_settlement ?? 0],
                ["已发放代理佣金", accQ.data?.agent_commission_paid ?? 0], ["待结算代理佣金", accQ.data?.agent_commission_pending ?? 0],
              ].map(([k, v]) => <div key={k as string} style={{ padding: 10, background: "var(--color-bg)", borderRadius: 8 }}><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{k}</div><div style={{ fontWeight: 600 }}>¥{(v as number).toLocaleString()}</div></div>)}
            </div>
          </div>
          <div style={card}>
            <h4 style={{ margin: 0, marginBottom: 12 }}>资金变动趋势（近 30 天累计）</h4>
            {(trendQ.data?.trend?.length ?? 0) === 0 ? <div style={{ color: "var(--color-text-secondary)" }}>暂无趋势数据</div> : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120 }}>
                {trendQ.data?.trend.map(p => {
                  const max = Math.max(...(trendQ.data?.trend ?? []).map(x => x.total), 1);
                  return <div key={p.date} title={`${p.date}: ¥${p.total}`} style={{ flex: 1, background: "var(--color-primary)", opacity: 0.8, height: `${Math.max((p.total / max) * 100, 2)}%`, borderRadius: "2px 2px 0 0" }} />;
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== Tab3 对账差异 ========== */}
      {tab === "reconcile" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select value={diffStatus} onChange={(e) => setDiffStatus(e.target.value)} style={{ ...inp, width: 140, marginBottom: 0 }}>
              <option value="">全部状态</option>
              <option value="pending">待处理</option><option value="resolved_platform">以平台为准</option>
              <option value="resolved_counterparty">以对方为准</option><option value="verify">待核实</option>
            </select>
            <input value={reconPeriod} onChange={(e) => setReconPeriod(e.target.value)} placeholder="对账周期 YYYY-MM" style={{ ...inp, width: 140, marginBottom: 0 }} />
            <button onClick={() => reconMut.mutate()} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>{reconMut.isPending ? "对账中..." : "触发对账"}</button>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)", marginLeft: "auto" }}>
              待处理 <strong style={{ color: "var(--color-danger-text)" }}>{diffQ.data?.stats.pending_count ?? 0}</strong> 项 · 差异 ¥{diffQ.data?.stats.pending_amount ?? 0}
            </span>
          </div>
          <div style={card}>
            {diffQ.isLoading ? <SkeletonGroup lines={4} /> : (diffQ.data?.list?.length ?? 0) === 0 ? <EmptyState title="暂无对账差异" /> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>对方</th><th style={{ padding: "8px" }}>类型</th><th style={{ padding: "8px" }}>周期</th><th style={{ padding: "8px" }}>平台记录</th>
                <th style={{ padding: "8px" }}>对方账单</th><th style={{ padding: "8px" }}>差异</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>操作</th>
              </tr></thead><tbody>
                {diffQ.data?.list.map(d => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{d.subject_type === "vendor" ? `供应商 · ${d.subject_name || d.subject_id}` : `代理 · ${d.subject_id}`}</td>
                    <td style={{ padding: "8px" }}>{d.check_type === "settlement" ? "结算对账" : d.check_type}</td>
                    <td style={{ padding: "8px" }}>{d.period}</td>
                    <td style={{ padding: "8px" }}>¥{d.platform_amount.toFixed(4)}</td>
                    <td style={{ padding: "8px" }}>¥{d.counterparty_amount.toFixed(4)}</td>
                    <td style={{ padding: "8px", fontWeight: 700, color: d.diff_amount > 0 ? "var(--color-danger-text)" : "var(--color-success-text)" }}>{d.diff_amount > 0 ? "+" : ""}¥{d.diff_amount.toFixed(4)}</td>
                    <td style={{ padding: "8px" }}><StatusBadge status={DIFF_STATUS_MAP[d.status] ?? "danger"}>{d.status_label}</StatusBadge></td>
                    <td style={{ padding: "8px" }}>
                      {d.status === "pending" ? (
                        <>
                          <button onClick={() => diffResolveMut.mutate({ id: d.id, mode: "platform" })} style={{ ...btnBase, background: "var(--color-success-bg)", color: "var(--color-success-text)", padding: "4px 8px", marginRight: 4 }}>以平台为准</button>
                          <button onClick={() => diffResolveMut.mutate({ id: d.id, mode: "counterparty" })} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-primary)", padding: "4px 8px", marginRight: 4 }}>以对方为准</button>
                          <button onClick={() => diffResolveMut.mutate({ id: d.id, mode: "verify" })} style={{ ...btnBase, background: "var(--color-warning-bg)", color: "var(--color-warning-text)", padding: "4px 8px" }}>待核实</button>
                        </>
                      ) : <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{d.remark ?? "—"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
      )}

      {/* ========== Tab4 结账管理 ========== */}
      {tab === "close" && (
        <div>
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>本期 · {closeStatusQ.data?.period ?? "—"}</div>
                <div style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>
                  结账状态: <span style={{ fontWeight: 600, color: closeStatusQ.data?.status === "locked" ? "var(--color-success-text)" : closeStatusQ.data?.status === "unlocked" ? "var(--color-warning-text)" : "var(--color-danger-text)" }}>{closeStatusQ.data?.status_label}</span>
                </div>
                {closeStatusQ.data?.status === "unlocked" && closeStatusQ.data.record?.relock_at && (
                  <div style={{ color: "var(--color-warning-text)", fontSize: 13, marginTop: 4 }}>临时解锁中，将于 {new Date(closeStatusQ.data.record.relock_at).toLocaleString()} 自动重锁</div>
                )}
                {closeStatusQ.data?.record?.unlocked_reason && <div style={{ color: "var(--color-text-secondary)", fontSize: 13, marginTop: 4 }}>解锁原因: {closeStatusQ.data.record.unlocked_reason}</div>}
              </div>
              {closeStatusQ.data?.status !== "locked" && (
                <button onClick={() => { setClosePeriod(closeStatusQ.data?.period ?? ""); setShowCloseConfirm(true); }} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff" }}>开始结账</button>
              )}
            </div>
          </div>

          <div style={card}>
            <h4 style={{ margin: 0, marginBottom: 12 }}>历史结账记录</h4>
            {closeHistQ.isLoading ? <SkeletonGroup lines={4} /> : (closeHistQ.data?.list?.length ?? 0) === 0 ? <EmptyState title="暂无结账记录" /> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>期间</th><th style={{ padding: "8px" }}>收入</th><th style={{ padding: "8px" }}>支出</th><th style={{ padding: "8px" }}>毛利</th>
                <th style={{ padding: "8px" }}>毛利率</th><th style={{ padding: "8px" }}>结转凭证</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>操作</th>
              </tr></thead><tbody>
                {closeHistQ.data?.list.map(p => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{p.period}</td>
                    <td style={{ padding: "8px" }}>¥{p.income_total.toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>¥{p.expense_total.toLocaleString()}</td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>¥{p.gross_profit.toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>{p.gross_margin}%</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{p.voucher_no ?? "—"}</td>
                    <td style={{ padding: "8px" }}>
                      <StatusBadge status={p.status === "open" ? "warning" : "success"}>{p.status_label}</StatusBadge>
                    </td>
                    <td style={{ padding: "8px" }}>
                      {p.status === "locked" && <button onClick={() => setUnlock({ period: p.period, reason: "" })} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", padding: "4px 8px" }}>临时解锁(超管)</button>}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
      )}

      {/* 流水详情 Modal */}
      <Modal open={!!ledgerDetail} onClose={() => setLedgerDetail(null)} title={`流水详情 — ${ledgerDetailQ.data?.serial_no ?? ""}`} width={480}>
        {ledgerDetailQ.isLoading ? <SkeletonGroup lines={5} /> : ledgerDetailQ.data && (
          <div style={{ fontSize: 14 }}>
            {[
              ["类型", ledgerDetailQ.data.type_label], ["金额", `¥${ledgerDetailQ.data.amount}`], ["余额", `¥${ledgerDetailQ.data.balance_after}`],
              ["关联订单", ledgerDetailQ.data.related_order_no ?? "—"], ["外部单号", ledgerDetailQ.data.external_ref ?? "—"], ["支付渠道", ledgerDetailQ.data.payment_channel ?? "—"],
              ["状态", ledgerDetailQ.data.status === "completed" ? "已完成" : ledgerDetailQ.data.status], ["关联用户", ledgerDetailQ.data.related?.user?.username ?? ledgerDetailQ.data.related?.user?.email ?? "—"],
              ["关联供应商", ledgerDetailQ.data.related?.vendor?.name ?? "—"], ["时间", ledgerDetailQ.data.created_at?.replace("T", " ")?.slice(0, 19)], ["备注", ledgerDetailQ.data.remark ?? "—"],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--color-border)" }}>
                <span style={{ color: "var(--color-text-secondary)" }}>{k}</span><strong style={{ textAlign: "right" }}>{v as any}</strong>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 内部调账 Modal */}
      <Modal open={!!adjust} onClose={() => setAdjust(null)} title="内部调账" width={400}>
        {adjust && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>正数=平台入账，负数=平台出账。需填写原因，操作记录将写入资金流水与操作日志。</div>
            <input value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} placeholder="金额（元，正/负）" type="number" style={inp} />
            <textarea value={adjust.remark} onChange={(e) => setAdjust({ ...adjust, remark: e.target.value })} placeholder="调账原因（必填）" rows={3} style={{ ...inp, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAdjust(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => adjustMut.mutate()} disabled={!adjust.amount || !adjust.remark} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>{adjustMut.isPending ? "提交中..." : "确认调账"}</button>
            </div>
          </>
        )}
      </Modal>

      {/* 结账确认 Modal */}
      <Modal open={showCloseConfirm} onClose={() => setShowCloseConfirm(false)} title="结账确认" width={460}>
        <div style={{ color: "var(--color-text)", lineHeight: 1.7 }}>确认锁定 <strong>{closePeriod}</strong> 月的所有财务数据？锁定后该月充值/消费/退款/佣金将不可修改，并自动生成结转凭证。</div>
        <div style={{ marginTop: 12, padding: 12, background: "var(--color-warning-bg)", borderRadius: 8, fontSize: 13, color: "var(--color-warning-text)" }}>⚠️ 结账前请确认所有对账、退款、发票已完成处理。</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={() => setShowCloseConfirm(false)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
          <button onClick={() => closeMut.mutate(closePeriod)} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff" }}>{closeMut.isPending ? "结账中..." : "确认结账"}</button>
        </div>
      </Modal>

      {/* 临时解锁 Modal */}
      <Modal open={!!unlock} onClose={() => setUnlock(null)} title={`临时解锁 ${unlock?.period ?? ""}`} width={400}>
        {unlock && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-warning-text)", background: "var(--color-warning-bg)", padding: 10, borderRadius: 8, marginBottom: 12 }}>仅超管可操作，解锁 1 小时后自动重新锁定。</div>
            <textarea value={unlock.reason} onChange={(e) => setUnlock({ ...unlock, reason: e.target.value })} placeholder="解锁理由（必填）" rows={3} style={{ ...inp, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setUnlock(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => unlockMut.mutate()} disabled={!unlock.reason} style={{ ...btnBase, background: "var(--color-warning-text)", color: "#fff" }}>{unlockMut.isPending ? "解锁中..." : "确认解锁"}</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

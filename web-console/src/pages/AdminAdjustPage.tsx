import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/**
 * 手动调账（产品裁决 2026-08-15，对齐原型 admin-adjust.html）
 * 三页签：发起调账 / 待我审批 / 调账台账
 * 分级审批：调增<1万免审；调增≥1万一级；调减<1万一级；调减≥1万二级（财务主管复核）
 */

interface AdjustRecord {
  id: number;
  user_id: number;
  username: string | null;
  email: string | null;
  direction: string;
  direction_label: string;
  amount: number;
  reason: string;
  subject: string;
  reference_no: string | null;
  approval_level: string;
  status: string;
  status_label: string;
  balance_before: number;
  balance_after: number;
  requested_by: number;
  requester_email: string | null;
  reject_reason: string | null;
  reversed_by_id: number | null;
  created_at: string;
}

const SUBJECTS = ["充值退款", "消费冲正", "佣金调整", "优惠赠送", "坏账核销", "其他"];
const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning",
  pending_level2: "warning",
  approved: "success",
  rejected: "danger",
  reversed: "default",
};

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 };

export default function AdminAdjustPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"create" | "approve" | "ledger">("create");

  // ── 发起调账表单 ──
  const [form, setForm] = useState({
    user_id: "",
    direction: "increase",
    amount: "",
    reason: "",
    subject: "充值退款",
    reference_no: "",
  });

  // ── 台账筛选 ──
  const [ledgerStatus, setLedgerStatus] = useState("");

  const ledgerQ = useQuery({
    queryKey: ["admin-adjust-ledger", ledgerStatus],
    queryFn: async () => (await api.get<{ data: { list: AdjustRecord[]; pagination: { total: number } } }>(`/admin/adjust/ledger?status=${ledgerStatus}&page_size=50`)).data.data,
  });
  const pendingQ = useQuery({
    queryKey: ["admin-adjust-pending"],
    queryFn: async () => (await api.get<{ data: { list: AdjustRecord[] } }>("/admin/adjust/pending?level=1")).data.data,
  });
  const pendingL2Q = useQuery({
    queryKey: ["admin-adjust-pending-l2"],
    queryFn: async () => (await api.get<{ data: { list: AdjustRecord[] } }>("/admin/adjust/pending?level=2")).data.data,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post("/admin/adjust", {
      user_id: Number(form.user_id),
      direction: form.direction,
      amount: Number(form.amount),
      reason: form.reason,
      subject: form.subject,
      reference_no: form.reference_no || undefined,
    })).data,
    onSuccess: (d: { data?: { message?: string } }) => {
      toast.success(d?.data?.message ?? "调账申请已提交");
      setForm({ user_id: "", direction: "increase", amount: "", reason: "", subject: "充值退款", reference_no: "" });
      qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] });
      qc.invalidateQueries({ queryKey: ["admin-adjust-pending"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const approveMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/adjust/${id}/approve`)).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已通过"); qc.invalidateQueries({ queryKey: ["admin-adjust-pending"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l2"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] }); },
    onError: (e) => toast.error(extractError(e)),
  });
  const reviewMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/adjust/${id}/review`)).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "二级复核通过"); qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l2"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] }); },
    onError: (e) => toast.error(extractError(e)),
  });
  const rejectMut = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => (await api.post(`/admin/adjust/${id}/reject`, { reason })).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已驳回"); qc.invalidateQueries({ queryKey: ["admin-adjust-pending"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l2"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] }); },
    onError: (e) => toast.error(extractError(e)),
  });
  const reverseMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/adjust/${id}/reverse`)).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已红冲"); qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  const amount = Number(form.amount) || 0;
  const isIncrease = form.direction === "increase";
  const needApproval = isIncrease ? amount >= 10000 : true;
  const approvalHint = !isIncrease && amount >= 10000
    ? "调减 ≥ ¥10,000 → 二级审批（财务主管复核）"
    : needApproval ? "一级审批（财务专员）" : "免审批 · 提交即生效";
  const canSubmit = Number(form.user_id) > 0 && amount > 0 && form.reason.trim() !== "";

  const rows = tab === "ledger" ? ledgerQ.data?.list ?? [] : tab === "approve" ? [...(pendingQ.data?.list ?? []), ...(pendingL2Q.data?.list ?? [])] : [];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        手动调账
        <HelpIcon text="财务核心操作：发起调账（分级审批）、待我审批（职责分离）、调账台账（前后余额快照 + 红字冲销 + 凭证归档）。错误调账不删除不编辑，通过红冲生成反向记录。" level="page" />
      </h2>

      {/* 统计卡 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
        <div style={{ ...card, cursor: "pointer", marginBottom: 0 }} onClick={() => setTab("approve")}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>🕓 待我审批</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{(pendingQ.data?.list?.length ?? 0) + (pendingL2Q.data?.list?.length ?? 0)}</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }} onClick={() => setTab("ledger")}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>📋 调账台账</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{ledgerQ.data?.pagination?.total ?? 0}</div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([["create", "➕ 发起调账"], ["approve", "✅ 待我审批"], ["ledger", "📋 调账台账"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ ...btnBase, background: tab === key ? "var(--color-primary)" : "var(--color-panel)", color: tab === key ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>{label}</button>
        ))}
      </div>

      {/* Tab 1 发起调账 */}
      {tab === "create" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={card}>
            <h3 style={{ marginBottom: 12 }}>📝 调账申请单</h3>
            <div>
              <label style={fieldLabel}>被调账用户 ID *</label>
              <input type="number" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} placeholder="输入用户 ID" style={inp} />
            </div>
            <div>
              <label style={fieldLabel}>业务类型（会计科目）*</label>
              <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} style={inp}>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <label style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="radio" name="dir" checked={form.direction === "increase"} onChange={() => setForm({ ...form, direction: "increase" })} /> 调增
              </label>
              <label style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="radio" name="dir" checked={form.direction === "decrease"} onChange={() => setForm({ ...form, direction: "decrease" })} /> 调减
              </label>
            </div>
            <div>
              <label style={fieldLabel}>调账金额（元）*</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" style={inp} />
            </div>
            <div>
              <label style={fieldLabel}>调账原因 *</label>
              <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="说明调账背景与依据，调减操作必须填写" style={{ ...inp, height: 72, resize: "vertical" }} />
            </div>
            <div>
              <label style={fieldLabel}>关联单号</label>
              <input value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} placeholder="工单 / 订单 / 退款单号" style={inp} />
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
              ⚖️ 审批路径：<strong style={{ color: needApproval ? "#fa8c16" : "#22c55e" }}>{approvalHint}</strong>
            </div>
            <button onClick={() => createMut.mutate()} disabled={!canSubmit || createMut.isPending} style={{ ...btnBase, width: "100%", background: canSubmit ? "var(--color-primary)" : "#a0b4f9", color: "#fff", height: 42, fontSize: 14 }}>
              {createMut.isPending ? "提交中..." : "🚀 提交调账申请"}
            </button>
          </div>

          <div style={card}>
            <h3 style={{ marginBottom: 12 }}>⚖️ 分级审批规则</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "6px 8px" }}>方向</th><th style={{ padding: "6px 8px" }}>金额</th><th style={{ padding: "6px 8px" }}>审批要求</th>
              </tr></thead>
              <tbody>
                <tr style={{ borderTop: "1px solid var(--color-border)" }}><td style={{ padding: "6px 8px" }}>调增</td><td style={{ padding: "6px 8px" }}>&lt; ¥10,000</td><td style={{ padding: "6px 8px", color: "#22c55e" }}>免审批 · 提交即生效</td></tr>
                <tr style={{ borderTop: "1px solid var(--color-border)" }}><td style={{ padding: "6px 8px" }}>调增</td><td style={{ padding: "6px 8px" }}>≥ ¥10,000</td><td style={{ padding: "6px 8px", color: "#fa8c16" }}>一级审批（财务专员）</td></tr>
                <tr style={{ borderTop: "1px solid var(--color-border)" }}><td style={{ padding: "6px 8px" }}>调减</td><td style={{ padding: "6px 8px" }}>&lt; ¥10,000</td><td style={{ padding: "6px 8px", color: "#fa8c16" }}>一级审批（财务专员）</td></tr>
                <tr style={{ borderTop: "1px solid var(--color-border)" }}><td style={{ padding: "6px 8px" }}>调减</td><td style={{ padding: "6px 8px" }}>≥ ¥10,000</td><td style={{ padding: "6px 8px", color: "#e53935" }}>二级审批（财务主管复核）</td></tr>
              </tbody>
            </table>
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <div>🔒 <strong>职责分离</strong>：申请人 ≠ 审批人，系统自动拦截自审</div>
              <div>📌 <strong>科目映射</strong>：每笔调账自动对应会计科目</div>
              <div>💾 <strong>前后快照</strong>：记录调账前 / 后余额，账实一致</div>
              <div>🔴 <strong>红字冲销</strong>：错误调账不删除不编辑，通过「红冲」生成反向记录</div>
              <div>📦 <strong>永久归档</strong>：调账记录不可篡改，随凭证永久留存</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2 待我审批 */}
      {tab === "approve" && (
        <div style={card}>
          <h3 style={{ marginBottom: 12 }}>✅ 待我审批（职责分离：不含自己申请的）</h3>
          {pendingQ.isLoading ? <SkeletonGroup lines={3} /> : rows.length === 0 ? (
            <EmptyState title="暂无待审批调账" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>用户</th><th style={{ padding: "8px" }}>方向</th><th style={{ padding: "8px" }}>金额</th>
                <th style={{ padding: "8px" }}>科目</th><th style={{ padding: "8px" }}>原因</th><th style={{ padding: "8px" }}>级别</th>
                <th style={{ padding: "8px" }}>申请时间</th><th style={{ padding: "8px" }}>操作</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px" }}><div style={{ fontWeight: 600 }}>{r.username || r.email}</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.email}</div></td>
                    <td style={{ padding: "8px" }}><span style={{ color: r.direction === "increase" ? "#22c55e" : "#e53935", fontWeight: 600 }}>{r.direction_label}</span></td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>¥{r.amount.toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>{r.subject}</td>
                    <td style={{ padding: "8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason}</td>
                    <td style={{ padding: "8px" }}>{r.approval_level === "level2" ? "二级" : r.approval_level === "level1" ? "一级" : "免审"}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>
                      {r.status === "pending_level2" ? (
                        <button onClick={() => reviewMut.mutate(r.id)} disabled={reviewMut.isPending} style={{ ...btnBase, background: "#4f6ef7", color: "#fff", padding: "4px 10px", fontSize: 12 }}>二级复核通过</button>
                      ) : (
                        <button onClick={() => approveMut.mutate(r.id)} disabled={approveMut.isPending} style={{ ...btnBase, background: "#22c55e", color: "#fff", padding: "4px 10px", fontSize: 12 }}>审批通过</button>
                      )}
                      <button onClick={() => rejectMut.mutate({ id: r.id, reason: "信息有误" })} disabled={rejectMut.isPending} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", padding: "4px 10px", fontSize: 12, marginLeft: 6 }}>驳回</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3 调账台账 */}
      {tab === "ledger" && (
        <div style={card}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>📋 调账台账</h3>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              {([["", "全部"], ["approved", "已生效"], ["pending", "待审"], ["pending_level2", "二级待审"], ["rejected", "已驳回"], ["reversed", "已红冲"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setLedgerStatus(v)} style={{ ...btnBase, fontSize: 12, padding: "4px 10px", background: ledgerStatus === v ? "var(--color-primary)" : "var(--color-bg)", color: ledgerStatus === v ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>{l}</button>
              ))}
            </div>
          </div>
          {ledgerQ.isLoading ? <SkeletonGroup lines={5} /> : rows.length === 0 ? (
            <EmptyState title="暂无调账记录" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>ID</th><th style={{ padding: "8px" }}>用户</th><th style={{ padding: "8px" }}>方向</th><th style={{ padding: "8px" }}>金额</th>
                <th style={{ padding: "8px" }}>科目</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>余额前→后</th>
                <th style={{ padding: "8px" }}>申请人</th><th style={{ padding: "8px" }}>时间</th><th style={{ padding: "8px" }}>操作</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>#{r.id}</td>
                    <td style={{ padding: "8px" }}>{r.username || r.email || `#${r.user_id}`}</td>
                    <td style={{ padding: "8px" }}><span style={{ color: r.direction === "increase" ? "#22c55e" : "#e53935", fontWeight: 600 }}>{r.direction_label}</span></td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>¥{r.amount.toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>{r.subject}</td>
                    <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[r.status] ?? "default"}>{r.status_label}</StatusBadge></td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>¥{r.balance_before.toFixed(2)} → ¥{r.balance_after.toFixed(2)}</td>
                    <td style={{ padding: "8px", fontSize: 12 }}>{r.requester_email ?? `#${r.requested_by}`}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 12 }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>
                      {r.status === "approved" && !r.reversed_by_id && (
                        <button onClick={() => reverseMut.mutate(r.id)} disabled={reverseMut.isPending} style={{ ...btnBase, background: "#fff1f0", color: "#c62828", border: "1px solid #fca5a5", padding: "4px 10px", fontSize: 12 }}>红字冲销</button>
                      )}
                      {r.reject_reason && <span style={{ fontSize: 11, color: "var(--color-danger-text)" }} title={r.reject_reason}>驳回</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

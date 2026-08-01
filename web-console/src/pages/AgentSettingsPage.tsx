import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/* ============ 类型 ============ */
interface AgentProfile {
  level: string;
  level_label: string;
  commission_rate: number;
  verify_status: string;
  referral_code: string;
  withdraw_account: string | null;
  withdraw_bank: string | null;
  withdraw_name: string | null;
}
interface CommissionRules {
  current_level: string;
  rules: { level: string; label: string; rate: number; desc: string; current: boolean }[];
}
interface WithdrawSummary {
  balance: number;            // 佣金账户可提（settled-已提现）
  commission_total: number;   // 累计佣金
  withdrawn: number;          // 已提现
  pending: number;            // 进行中提现
  withdrawable: number;       // 可提现
  active_withdraw: number;
  active_amount: number;
  min_withdraw: number;
  account_set: boolean;
  level: string;
}
interface Commission {
  id: number;
  user_id: number;
  user_email: string;
  consumption_amount: number;
  rate: number;
  commission_amount: number;
  level: string;
  status: string;
  created_at: string;
}
interface Withdrawal {
  id: number;
  withdrawal_no: string;
  amount: number;
  status: string;
  status_label: string;
  reject_reason: string | null;
  first_review_note: string | null;
  second_review_note: string | null;
  transfer_no: string | null;
  created_at: string;
  completed_at: string | null;
}
interface ReferralInfo {
  referral_code: string;
  invite_url: string;
  invited_count: number;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600 };
const LEVEL_BADGE: Record<string, { bg: string; color: string }> = {
  prepare: { bg: "#f1f5f9", color: "#475569" },
  level1: { bg: "#dbeafe", color: "#1e40af" },
  senior: { bg: "#fef3c7", color: "#92400e" },
};

export default function AgentSettingsPage() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [withdrawForm, setWithdrawForm] = useState({ account: "", bank: "", name: "" });
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [applyAmount, setApplyAmount] = useState<string>("");

  const profileQ = useQuery({
    queryKey: ["me-agent-profile"],
    queryFn: async () => (await api.get<{ data: AgentProfile }>("/me/agent/profile")).data.data,
  });
  const rulesQ = useQuery({
    queryKey: ["me-agent-rules"],
    queryFn: async () => (await api.get<{ data: CommissionRules }>("/me/agent/commission-rules")).data.data,
  });
  const summaryQ = useQuery({
    queryKey: ["me-agent-summary"],
    queryFn: async () => (await api.get<{ data: WithdrawSummary }>("/me/agent/withdraw-summary")).data.data,
  });
  const referralQ = useQuery({
    queryKey: ["me-agent-referral"],
    queryFn: async () => (await api.get<{ data: ReferralInfo }>("/me/agent/referral")).data.data,
  });
  const prefsQ = useQuery({
    queryKey: ["me-agent-prefs"],
    queryFn: async () => {
      const d = (await api.get<{ data: Record<string, boolean> }>("/me/agent/notif-prefs")).data.data;
      // 默认通知项（若尚未设置）
      const defaults: Record<string, boolean> = { customer_alert: true, commission_notify: true, audit_notify: true };
      const merged = { ...defaults, ...d };
      setPrefs(merged);
      return merged;
    },
  });
  const withdrawalsQ = useQuery({
    queryKey: ["me-agent-withdrawals"],
    queryFn: async () => (await api.get<{ data: { list: Withdrawal[]; pagination: { total: number } } }>("/me/agent/withdrawals?page_size=20")).data.data,
  });
  const commissionsQ = useQuery({
    queryKey: ["me-agent-commissions"],
    queryFn: async () => (await api.get<{ data: { list: Commission[]; total: number } }>("/me/agent/commissions?page_size=20")).data.data,
  });

  const upgradeMut = useMutation({
    mutationFn: async () => (await api.post("/me/agent/upgrade-request", {})).data,
    onSuccess: () => { setNotice({ type: "success", msg: "升级申请已提交，等待审核" }); qc.invalidateQueries({ queryKey: ["me-agent-profile"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const withdrawMut = useMutation({
    mutationFn: async () => (await api.put("/me/agent/withdraw-settings", withdrawForm)).data,
    onSuccess: () => { setNotice({ type: "success", msg: "提现设置已保存" }); qc.invalidateQueries({ queryKey: ["me-agent-summary"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const applyWithdrawMut = useMutation({
    mutationFn: async () => {
      const amount = Number(applyAmount);
      return (await api.post("/me/agent/withdraw", { amount })).data;
    },
    onSuccess: () => { setNotice({ type: "success", msg: "提现申请已提交，待审核" }); setApplyAmount(""); qc.invalidateQueries({ queryKey: ["me-agent-summary"] }); qc.invalidateQueries({ queryKey: ["me-agent-withdrawals"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const prefsMut = useMutation({
    mutationFn: async () => (await api.put("/me/agent/notif-prefs", prefs)).data,
    onSuccess: () => setNotice({ type: "success", msg: "通知偏好已保存" }),
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const prof = profileQ.data;
  const sum = summaryQ.data;
  const ref = referralQ.data;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(ref?.invite_url ?? "");
      setNotice({ type: "success", msg: "邀请链接已复制" });
    } catch {
      setNotice({ type: "error", msg: "复制失败" });
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>代理设置</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 24 }}>
        {/* 代理信息卡 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>代理信息</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 28 }}>🛡️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{prof?.level_label ?? "-"}</div>
              <span
                style={{
                  ...(LEVEL_BADGE[prof?.level ?? "prepare"] ?? LEVEL_BADGE.prepare),
                  padding: "2px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                {prof?.level ?? "prepare"}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 2 }}>
            <div>佣金率: <strong>{(prof?.commission_rate ?? 0) * 100}%</strong></div>
            <div>实名状态: <strong>{prof?.verify_status === "verified" ? "已认证" : prof?.verify_status === "pending" ? "审核中" : "未认证"}</strong></div>
            <div>邀请码: <strong style={{ fontFamily: "monospace" }}>{prof?.referral_code}</strong></div>
          </div>
          {prof?.level === "prepare" && (
            <button
              onClick={() => upgradeMut.mutate()}
              disabled={upgradeMut.isPending || prof.verify_status === "pending"}
              style={{ ...btnBase, background: "#2563eb", color: "#fff", marginTop: 16, opacity: upgradeMut.isPending || prof.verify_status === "pending" ? 0.6 : 1 }}
            >
              {upgradeMut.isPending ? "提交中..." : prof.verify_status === "pending" ? "升级申请审核中" : "申请升级一级代理"}
            </button>
          )}
        </div>

        {/* 提现汇总卡（佣金账户）*/}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>佣金汇总</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              <div style={{ color: "#64748b" }}>累计佣金</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>¥{(sum?.commission_total ?? 0).toFixed(2)}</div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              <div style={{ color: "#64748b" }}>可提现</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: (sum?.withdrawable ?? 0) > 0 ? "#16a34a" : "#94a3b8" }}>
                ¥{(sum?.withdrawable ?? 0).toFixed(2)}
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              <div style={{ color: "#64748b" }}>已提现</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>¥{(sum?.withdrawn ?? 0).toFixed(2)}</div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              <div style={{ color: "#64748b" }}>进行中提现</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>¥{(sum?.pending ?? 0).toFixed(2)}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>
            下属客户消费按 {((prof?.commission_rate ?? 0) * 100).toFixed(0)}% 计佣；最低提现 ¥{sum?.min_withdraw ?? "-"}
          </div>
        </div>

        {/* 邀请裂变卡 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>邀请裂变</h3>
          <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>邀请链接</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: "#2563eb" }}>{ref?.invite_url}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              已邀请客户: <strong>{ref?.invited_count ?? 0}</strong>
            </div>
            <button onClick={copyInvite} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>
              复制链接
            </button>
          </div>
        </div>
      </div>

      {/* 佣金规则 */}
      <div style={{ ...card, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>佣金规则（三级）</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "#64748b", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>等级</th>
              <th style={{ padding: "8px" }}>佣金率</th>
              <th style={{ padding: "8px" }}>说明</th>
              <th style={{ padding: "8px" }}>状态</th>
            </tr>
          </thead>
          <tbody>
            {rulesQ.data?.rules.map((r) => (
              <tr key={r.level} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "8px", fontWeight: 600 }}>{r.label}</td>
                <td style={{ padding: "8px" }}>{r.rate * 100}%</td>
                <td style={{ padding: "8px", color: "#64748b" }}>{r.desc}</td>
                <td style={{ padding: "8px" }}>
                  {r.current ? (
                    <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>当前等级</span>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 提现设置 + 通知偏好 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 提现设置 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>提现设置</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: "#64748b", display: "block", marginBottom: 4 }}>收款账号 *</label>
              <input
                value={withdrawForm.account}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, account: e.target.value })}
                placeholder="银行卡号 / 支付宝 / 微信"
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#64748b", display: "block", marginBottom: 4 }}>开户行</label>
              <input
                value={withdrawForm.bank}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, bank: e.target.value })}
                placeholder="如：招商银行"
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#64748b", display: "block", marginBottom: 4 }}>收款人姓名</label>
              <input
                value={withdrawForm.name}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, name: e.target.value })}
                placeholder="真实姓名"
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <button onClick={() => withdrawMut.mutate()} disabled={withdrawMut.isPending || !withdrawForm.account} style={{ ...btnBase, background: "#16a34a", color: "#fff", opacity: withdrawMut.isPending || !withdrawForm.account ? 0.6 : 1 }}>
              {withdrawMut.isPending ? "保存中..." : "保存提现设置"}
            </button>
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>提交提现申请（最低 ¥{sum?.min_withdraw ?? "-"}）</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={applyAmount}
                  onChange={(e) => setApplyAmount(e.target.value)}
                  placeholder="提现金额"
                  type="number"
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", flex: 1, boxSizing: "border-box" }}
                />
                <button
                  onClick={() => applyWithdrawMut.mutate()}
                  disabled={applyWithdrawMut.isPending || !Number(applyAmount) || (sum?.withdrawable ?? 0) <= 0}
                  style={{ ...btnBase, background: "#2563eb", color: "#fff", whiteSpace: "nowrap", opacity: applyWithdrawMut.isPending || !Number(applyAmount) || (sum?.withdrawable ?? 0) <= 0 ? 0.6 : 1 }}
                >
                  {applyWithdrawMut.isPending ? "提交中..." : "申请提现"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 通知偏好 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>通知偏好</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(prefs).map(([key, val]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={val}
                  onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                {key === "customer_alert" ? "客户消费告警" : key === "commission_notify" ? "佣金到账通知" : key === "audit_notify" ? "审批结果通知" : key}
              </label>
            ))}
            <button onClick={() => prefsMut.mutate()} disabled={prefsMut.isPending} style={{ ...btnBase, background: "#16a34a", color: "#fff", opacity: prefsMut.isPending ? 0.6 : 1 }}>
              {prefsMut.isPending ? "保存中..." : "保存通知偏好"}
            </button>
          </div>
        </div>
      </div>

      {/* 提现记录 */}
      <div style={{ ...card, marginTop: 24 }}>
        <h3 style={{ marginBottom: 16 }}>提现记录</h3>
        {withdrawalsQ.isLoading ? (
          <div style={{ color: "#94a3b8", fontSize: 14 }}>加载中...</div>
        ) : (withdrawalsQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 14 }}>暂无提现记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>提现单号</th>
                <th style={{ padding: "8px" }}>金额</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>提交时间</th>
                <th style={{ padding: "8px" }}>备注</th>
              </tr>
            </thead>
            <tbody>
              {withdrawalsQ.data?.list.map((w) => (
                <tr key={w.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{w.withdrawal_no}</td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>¥{w.amount.toFixed(2)}</td>
                  <td style={{ padding: "8px" }}>
                    <span
                      style={{
                        padding: "2px 10px",
                        borderRadius: 6,
                        fontSize: 12,
                        background: w.status === "completed" ? "#dcfce7" : w.status === "rejected" ? "#fee2e2" : w.status === "processing" ? "#dbeafe" : "#fef3c7",
                        color: w.status === "completed" ? "#166534" : w.status === "rejected" ? "#991b1b" : w.status === "processing" ? "#1e40af" : "#92400e",
                      }}
                    >
                      {w.status_label}
                    </span>
                  </td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{new Date(w.created_at).toLocaleString()}</td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{w.reject_reason ?? w.first_review_note ?? w.transfer_no ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 佣金明细 */}
      <div style={{ ...card, marginTop: 24 }}>
        <h3 style={{ marginBottom: 16 }}>佣金明细</h3>
        {commissionsQ.isLoading ? (
          <div style={{ color: "#94a3b8", fontSize: 14 }}>加载中...</div>
        ) : (commissionsQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 14 }}>暂无佣金记录（邀请客户消费后产生）</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>客户</th>
                <th style={{ padding: "8px" }}>消费额</th>
                <th style={{ padding: "8px" }}>佣金率</th>
                <th style={{ padding: "8px" }}>佣金</th>
                <th style={{ padding: "8px" }}>时间</th>
              </tr>
            </thead>
            <tbody>
              {commissionsQ.data?.list.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontSize: 13 }}>{c.user_email}</td>
                  <td style={{ padding: "8px" }}>¥{c.consumption_amount.toFixed(2)}</td>
                  <td style={{ padding: "8px" }}>{(c.rate * 100).toFixed(0)}%</td>
                  <td style={{ padding: "8px", fontWeight: 600, color: "#16a34a" }}>¥{c.commission_amount.toFixed(2)}</td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{new Date(c.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}
          <button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

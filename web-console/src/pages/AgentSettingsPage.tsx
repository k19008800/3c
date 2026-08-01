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
  customer_count: number;
  sub_consumption: number;
  commission_rate: number;
  estimated_commission: number;
  withdrawable: number;
  min_withdraw: number;
  account_set: boolean;
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

  const upgradeMut = useMutation({
    mutationFn: async () => (await api.post("/me/agent/upgrade-request")).data,
    onSuccess: () => { setNotice({ type: "success", msg: "升级申请已提交，等待审核" }); qc.invalidateQueries({ queryKey: ["me-agent-profile"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const withdrawMut = useMutation({
    mutationFn: async () => (await api.put("/me/agent/withdraw-settings", withdrawForm)).data,
    onSuccess: () => { setNotice({ type: "success", msg: "提现设置已保存" }); qc.invalidateQueries({ queryKey: ["me-agent-summary"] }); },
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

        {/* 提现汇总卡 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>提现汇总</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              <div style={{ color: "#64748b" }}>下属客户</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{sum?.customer_count ?? "-"}</div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              <div style={{ color: "#64748b" }}>可提现</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: (sum?.withdrawable ?? 0) > 0 ? "#16a34a" : "#94a3b8" }}>
                ¥{(sum?.withdrawable ?? 0).toFixed(2)}
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              <div style={{ color: "#64748b" }}>预估佣金</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>¥{(sum?.estimated_commission ?? 0).toFixed(2)}</div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              <div style={{ color: "#64748b" }}>最低提现</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>¥{sum?.min_withdraw ?? "-"}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>
            预备代理不可提现，升级后按佣金率结算
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

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}
          <button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

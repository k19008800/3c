import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";
import "./console-misc.css";

interface WithdrawRecord { id: number; withdraw_no: string; amount: number; bank_name: string; account_number: string; status: string; status_label: string; reviewer_note: string | null; created_at: string; updated_at: string; }
interface BankInfo { bank_name: string; account_number: string; account_holder: string; }

export default function AgentWithdrawPage() {
  const { toast } = useToast();
  const [records, setRecords] = useState<WithdrawRecord[]>([]);
  const [balance, setBalance] = useState(0);
  const [bank, setBank] = useState<BankInfo>({ bank_name: "", account_number: "", account_holder: "" });
  const [amount, setAmount] = useState("");
  const [showApply, setShowApply] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/agent/withdraw/balance").then(r => setBalance(r.data?.data?.balance ?? 0)),
      api.get("/agent/withdraw/records").then(r => setRecords(r.data?.data?.list ?? [])),
      api.get("/agent/withdraw/bank-info").then(r => setBank(r.data?.data ?? bank)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function submitWithdraw() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("请输入有效金额"); return; }
    if (amt * 100 > balance) { toast.error("余额不足"); return; }
    if (!bank.bank_name || !bank.account_number) { toast.error("请先完善银行账户信息"); return; }
    try {
      await api.post("/agent/withdraw/apply", { amount: amt * 100 });
      toast.success("提现申请已提交，等待审核");
      setShowApply(false); setAmount("");
      const r = await api.get("/agent/withdraw/records");
      setRecords(r.data?.data?.list ?? []);
      const b = await api.get("/agent/withdraw/balance");
      setBalance(b.data?.data?.balance ?? balance - amt * 100);
    } catch (e: any) { toast.error(e?.response?.data?.message ?? "提现申请失败"); }
  }

  async function saveBankInfo() {
    await api.put("/agent/withdraw/bank-info", bank);
    toast.success("银行账户已更新");
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>加载中…</div>;

  return (
    <div>
      <div className="cm-pagehead">
        <div className="cm-pagehead__titles">
          <div className="cm-pagehead__title">提现管理
            <HelpIcon text="管理您的可提现余额，申请提现到绑定的银行账户。提现需平台审核，通常1-2个工作日到账。" level="page" />
          </div>
          <div className="cm-pagehead__sub">可提现余额申请至绑定银行账户，平台审核后 1–2 个工作日到账。</div>
        </div>
      </div>

      <div className="cm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", padding: 24, boxShadow: "var(--shadow-card)" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 15, color: "var(--color-text)" }}>可提现余额</h4>
          <div style={{ fontSize: 36, fontWeight: 700, color: "var(--color-text)", marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>¥{(balance / 100).toFixed(2)}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>可提现余额 = 已结算佣金 - 已提现金额</div>
          <button onClick={() => setShowApply(true)} disabled={balance <= 0}
            style={{ padding: "10px 24px", background: balance > 0 ? "var(--color-primary)" : "var(--color-disabled-bg)", color: balance > 0 ? "#fff" : "var(--color-text-disabled)", border: "none", borderRadius: "var(--radius-md)", cursor: balance > 0 ? "pointer" : "not-allowed", fontWeight: 600, fontSize: 14 }}>
            申请提现 <HelpIcon text="提交提现申请后，平台将在1-2个工作日内审核处理。" />
          </button>
        </div>

        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", padding: 24, boxShadow: "var(--shadow-card)" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 15, color: "var(--color-text)" }}>收款账户 <HelpIcon text="提现款项将打入此银行账户，请确保信息正确。" /></h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input placeholder="银行名称 (如: 招商银行)" value={bank.bank_name} onChange={e => setBank({...bank, bank_name: e.target.value})}
              style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: 13 }} />
            <input placeholder="银行卡号" value={bank.account_number} onChange={e => setBank({...bank, account_number: e.target.value})}
              style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: 13 }} />
            <input placeholder="持卡人姓名" value={bank.account_holder} onChange={e => setBank({...bank, account_holder: e.target.value})}
              style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: 13 }} />
            <button onClick={saveBankInfo} style={{ padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, marginTop: 4 }}>保存账户</button>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <h4 style={{ margin: 0, padding: "16px 20px", borderBottom: "1px solid var(--color-divider)", fontSize: 15, color: "var(--color-text)" }}>提现记录</h4>
        <table className="cm-table">
          <thead><tr>
            <th>编号</th><th className="num">金额</th><th>银行</th><th style={{textAlign:"center"}}>状态</th><th>备注</th><th>时间</th>
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: "var(--font-family-mono)", fontSize: 12 }}>#{r.withdraw_no ?? r.id}</td>
                <td className="num" style={{ fontWeight: 600 }}>¥{(r.amount / 100).toFixed(2)}</td>
                <td>{r.bank_name}</td>
                <td style={{ textAlign: "center" }}>
                  <StatusBadge status={({ pending: "warning", processing: "info", completed: "success", rejected: "danger" } as Record<string, "success" | "warning" | "danger" | "info">)[r.status] ?? "info"}>{r.status_label ?? r.status}</StatusBadge>
                </td>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>{r.reviewer_note ?? "-"}</td>
                <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>暂无提现记录</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={showApply} onClose={() => setShowApply(false)} title="申请提现">
        <div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>可提现余额：<strong style={{ color: "var(--color-text)" }}>¥{(balance / 100).toFixed(2)}</strong></div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
            收款账户：{bank.bank_name || "未绑定"} {bank.account_number ? bank.account_number.replace(/.(?=.{4})/g, "*") : ""}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>提现金额 (¥)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: 16, boxSizing: "border-box" }}
              placeholder="请输入提现金额" />
            {amount && Number(amount) * 100 > balance && <div style={{ color: "var(--color-danger-text)", fontSize: 12, marginTop: 4 }}>余额不足</div>}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowApply(false)} style={{ padding: "8px 20px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-panel)", cursor: "pointer" }}>取消</button>
            <button onClick={submitWithdraw} style={{ padding: "8px 20px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>提交申请</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

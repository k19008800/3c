"use client";

import React, { useState } from "react";
import { HelpIcon, StatusBadge, useToast } from "@3cloud/shared-ui";

interface InvoiceRec { id: string; time: string; type: string; amount: number; status: "pending" | "invoiced" | "rejected"; text: string; reason?: string; no?: string; }
const INIT: InvoiceRec[] = [
  { id: "1", time: "2026-08-05 14:30", type: "普通发票（电子）", amount: 2000, status: "pending", text: "待审核" },
  { id: "2", time: "2026-07-28 10:15", type: "普通发票（电子）", amount: 5000, status: "invoiced", text: "已开票", no: "INV-2026-0728-001" },
  { id: "3", time: "2026-07-15 16:42", type: "专用发票（电子）", amount: 3500, status: "invoiced", text: "已开票", no: "INV-2026-0715-002" },
  { id: "4", time: "2026-07-03 09:20", type: "普通发票（电子）", amount: 1500, status: "rejected", text: "已驳回", reason: "金额与充值记录不匹配" },
  { id: "5", time: "2026-06-20 11:05", type: "普通发票（电子）", amount: 0, status: "invoiced", text: "已开票", no: "INV-2026-0620-003" },
];
const BAL = 8000;

const panel = { background: "var(--color-panel)", borderRadius: 12, boxShadow: "var(--shadow-panel)", overflow: "hidden" };
const thS: React.CSSProperties = { textAlign: "left", padding: "10px 12px", background: "var(--color-table-header-bg)", fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--color-divider)", whiteSpace: "nowrap" };
const tdS: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--color-divider-light)", fontSize: 13, color: "var(--color-text)" };

const badgeMap: Record<string, "success" | "warning" | "danger" | "info" | "default"> = { pending: "warning", invoiced: "success", rejected: "danger" };

const extraFields = [
  { k: "taxid" as const, label: "税号", hint: "纳税人识别号", ph: "请输入税号" },
  { k: "address" as const, label: "地址", hint: "注册地址", ph: "请输入注册地址" },
  { k: "phone" as const, label: "电话", hint: "注册联系电话", ph: "请输入联系电话" },
  { k: "bank" as const, label: "开户行", hint: "开户银行名称", ph: "请输入开户银行" },
  { k: "account" as const, label: "账号", hint: "银行账号", ph: "请输入银行账号" },
];

export default function InvoicesPage() {
  const { toast } = useToast();
  const [invType, setInvType] = useState<"general" | "special">("general");
  const [amt, setAmt] = useState(""); const [activeAmt, setActiveAmt] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [taxid, setTaxid] = useState(""); const [addr, setAddr] = useState("");
  const [phone, setPhone] = useState(""); const [bank, setBank] = useState(""); const [acct, setAcct] = useState("");
  const [balance, setBalance] = useState(BAL);
  const [records, setRecords] = useState(INIT);

  const val = parseFloat(amt) || 0;
  const valid = val > 0 && val <= balance && name.trim() && (invType === "special" ? taxid && addr && phone && bank && acct : true);

  const setQuick = (mode: string) => {
    const v = mode === "all" ? balance : mode === "50" ? +(balance * 0.5).toFixed(2) : balance;
    setAmt(v.toString()); setActiveAmt(mode);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmt(e.target.value.replace(/[^\d.]/g, "")); setActiveAmt(null);
  };

  const submit = () => {
    if (!valid) { toast.error("请完善开票信息"); return; }
    const d = new Date(); const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setRecords(prev => [{ id: String(Date.now()), time: ts, type: invType === "general" ? "普通发票（电子）" : "专用发票（电子）", amount: val, status: "pending", text: "待审核" }, ...prev]);
    setBalance(prev => prev - val); toast.success("发票申请已提交，等待审核");
    setAmt(""); setName(""); setTaxid(""); setAddr(""); setPhone(""); setBank(""); setAcct(""); setActiveAmt(null);
  };

  const extraVals: Record<string, string> = { taxid, address: addr, phone, bank, account: acct };
  const extraSetters: Record<string, (v: string) => void> = { taxid: setTaxid, address: setAddr, phone: setPhone, bank: setBank, account: setAcct };

  return (
    <div style={{ padding: "var(--main-padding)" }}>
      {/* Balance Card */}
      <div style={{ background: "var(--color-panel)", borderRadius: 8, padding: 24, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "var(--shadow-card)" }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            可开票余额 <HelpIcon text="可开票余额 = 累计充值金额 - 已开票金额" />
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, color: "var(--color-text)" }}>
            ¥{balance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
            可开票余额 = <span style={{ color: "var(--color-primary)" }}>累计充值</span> - <span style={{ color: "var(--color-primary)" }}>已开票金额</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            累计充值 <span style={{ color: "var(--color-text)", fontWeight: 500 }}>¥20,000.00</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            已开票金额 <span style={{ color: "var(--color-text)", fontWeight: 500 }}>
              ¥{(20000 - balance).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Application Form */}
      <div style={panel}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>开票申请 <HelpIcon text="填写发票类型、金额及开票信息" /></h3>
        </div>
        <div style={{ padding: 20 }}>
          {/* Type Tabs */}
          <div style={{ display: "flex", gap: 4, background: "var(--color-disabled-bg)", borderRadius: 6, padding: 3, marginBottom: 20, width: "fit-content" }}>
            {(["general", "special"] as const).map(t => (
              <button key={t} onClick={() => setInvType(t)}
                style={{ padding: "8px 20px", borderRadius: 4, border: "none", background: invType === t ? "var(--color-panel)" : "transparent", color: invType === t ? "var(--color-primary)" : "var(--color-text-secondary)", fontSize: 13, cursor: "pointer", boxShadow: invType === t ? "0 1px 2px rgba(0,0,0,0.1)" : "none" }}>
                {t === "general" ? "普通发票（电子）" : "专用发票（纸质/电子）"}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              开票金额 <HelpIcon text="不能超过可开票余额" />
            </div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <span style={{ padding: "8px 12px", background: "var(--color-table-header-bg)", border: "1px solid var(--color-border)", borderRight: "none", borderRadius: "6px 0 0 6px", color: "var(--color-text-secondary)", fontSize: 14 }}>¥</span>
              <input value={amt} onChange={handleInput} placeholder="请输入开票金额"
                style={{ flex: 1, maxWidth: 300, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: "0 6px 6px 0", background: "var(--color-panel)", fontSize: 14, outline: "none", color: "var(--color-text)" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ k: "all", l: "全部可用余额" },{ k: "50", l: "50%" },{ k: "100", l: "100%" }].map(q => (
                <button key={q.k} onClick={() => setQuick(q.k)}
                  style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${activeAmt === q.k ? "var(--color-primary)" : "var(--color-border)"}`, background: activeAmt === q.k ? "var(--color-primary-light)" : "var(--color-panel)", color: activeAmt === q.k ? "var(--color-primary)" : "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" }}>{q.l}</button>
              ))}
            </div>
          </div>

          {/* Invoice Info Grid */}
          <div style={{ display: "grid", gridTemplateColumns: invType === "special" ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 24 }}>
            {/* Name field - always shown, full row */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                名称 <HelpIcon text="发票抬头名称" />
              </label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="请输入发票抬头名称"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 13, outline: "none", color: "var(--color-text)" }} />
            </div>
            {/* Extra fields for special invoice */}
            {invType === "special" && extraFields.map(f => (
              <div key={f.k}>
                <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                  {f.label} <HelpIcon text={f.hint} />
                </label>
                <input value={extraVals[f.k]} onChange={e => extraSetters[f.k](e.target.value)} placeholder={f.ph}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 13, outline: "none", color: "var(--color-text)" }} />
              </div>
            ))}
          </div>

          {/* Submit */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={submit} disabled={!valid}
              style={{ padding: "10px 32px", borderRadius: 8, border: "none", background: valid ? "var(--color-primary)" : "var(--color-disabled-bg)", color: valid ? "#fff" : "#bbb", fontSize: 14, fontWeight: 500, cursor: valid ? "pointer" : "not-allowed" }}>提交申请</button>
            <a href="#records" style={{ fontSize: 13, color: "var(--color-primary)", textDecoration: "none" }}>开票记录</a>
          </div>
        </div>
      </div>

      {/* Records */}
      <div style={panel} id="records">
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>开票记录 <HelpIcon text="按申请时间倒序排列" /></h3>
        </div>
        <div style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["申请时间","发票类型","开票金额","状态","操作"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td style={tdS}>{r.time}</td>
                  <td style={tdS}>{r.type}</td>
                  <td style={tdS}>¥{r.amount.toFixed(2)}</td>
                  <td style={tdS}>
                    {r.status === "rejected" ? (
                      <span title={r.reason} style={{ cursor: "help" }}>
                        <StatusBadge status="danger">{r.text}</StatusBadge>
                      </span>
                    ) : (
                      <StatusBadge status={badgeMap[r.status]}>{r.text}</StatusBadge>
                    )}
                  </td>
                  <td style={tdS}>
                    {r.status === "rejected" ? (
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.reason}</span>
                    ) : r.status === "pending" ? "—" : (
                      <a onClick={() => toast.success(`正在下载 ${r.no}.pdf...`)}
                        style={{ color: "var(--color-primary)", cursor: "pointer", fontSize: 12 }}>下载 PDF</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

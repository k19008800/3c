"use client";

import React, { useState, useRef } from "react";
import { HelpIcon, StatusBadge, useToast } from "@3cloud/shared-ui";

const QUICK = ["50", "100", "200", "500", "1000", "5000"];
const BALANCE = 12345.67;

const RECORDS = [
  { id: "1", time: "2026-08-05 14:30", amount: 500, method: "支付宝", status: "success" as const, text: "已完成" },
  { id: "2", time: "2026-08-04 10:00", amount: 1000, method: "微信支付", status: "success" as const, text: "已完成" },
  { id: "3", time: "2026-08-02 16:20", amount: 5000, method: "对公转账", status: "warning" as const, text: "审核中" },
  { id: "4", time: "2026-07-28 09:15", amount: 200, method: "支付宝", status: "success" as const, text: "已完成" },
];

const panel = { background: "var(--color-panel)", borderRadius: 12, boxShadow: "var(--shadow-panel)", overflow: "hidden" };

export default function RechargePage() {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [pay, setPay] = useState("alipay");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [auditAmt, setAuditAmt] = useState("¥0.00");
  const fileRef = useRef<HTMLInputElement>(null);

  const isTransfer = pay === "transfer";
  const val = parseFloat(amount) || 0;

  const handleSubmit = () => {
    if (!val || val <= 0) { toast.error("请输入有效的充值金额"); return; }
    if (isTransfer) {
      setAuditAmt(`¥${val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`);
      setShowAudit(true);
      toast.info("对公转账申请已提交，等待审核");
    } else {
      toast.success(`✅ 已创建 ¥${val.toFixed(2)} 订单，跳转支付收银台`);
    }
  };

  return (
    <div style={{ padding: "var(--main-padding)" }}>
      <div style={{ background: "var(--color-panel)", borderRadius: 16, padding: 32, maxWidth: 520, boxShadow: "var(--shadow-card)" }}>
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 24 }}>
          当前余额 <span style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>¥{BALANCE.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>充值金额</label>
          <input type="text" placeholder="输入充值金额" value={amount}
            onChange={e => { setAmount(e.target.value.replace(/[^\d.]/g, "")); setActive(null); }}
            style={{ width: "100%", height: 48, border: "1px solid var(--color-border)", borderRadius: 8, padding: "0 16px", fontSize: 20, outline: "none", background: "var(--color-panel)", color: "var(--color-text)" }} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          {QUICK.map(a => (
            <button key={a} onClick={() => { setAmount(a); setActive(a); }}
              style={{ padding: "8px 20px", border: `1px solid ${active === a ? "var(--color-primary)" : "var(--color-border)"}`, borderRadius: 8, background: active === a ? "var(--color-primary-light)" : "var(--color-panel)", color: active === a ? "var(--color-primary)" : "var(--color-text)", fontSize: 14, cursor: "pointer", transition: "all var(--transition-fast)" }}>
              ¥{parseInt(a).toLocaleString()}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 8 }}>支付方式</label>
          {["alipay","wechat","transfer"].map(m => (
            <label key={m}
              onClick={() => setPay(m)}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", border: `1px solid ${pay === m ? "var(--color-primary)" : "var(--color-border)"}`, borderRadius: 8, cursor: "pointer", marginRight: 12, marginBottom: 8, background: pay === m ? "var(--color-primary-light)" : "var(--color-panel)", transition: "all var(--transition-fast)" }}>
              <input type="radio" name="pay" checked={pay === m} onChange={() => setPay(m)} style={{ accentColor: "var(--color-primary)" }} />
              {m === "alipay" ? "支付宝" : m === "wechat" ? "微信支付" : "对公转账"}
            </label>
          ))}
        </div>

        {isTransfer && !showAudit && (
          <div style={{ marginTop: 16, padding: 16, background: "#f8f9fa", borderRadius: 10, border: "1px solid #e8e8e8" }}>
            <h4 style={{ fontSize: 14, color: "#1a1a1a", marginBottom: 12 }}>🏦 对公转账信息</h4>
            {[
              ["开户名称", "杭州灵通云智算科技有限公司"],
              ["银行账号", "5719020097201298888 📋"],
              ["开户银行", "招商银行杭州分行高新支行"],
              ["转账金额", `¥${val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`],
            ].map(([l, v], i) => (
              <div key={i} style={{ display: "flex", marginBottom: 8, fontSize: 13 }}>
                <span style={{ width: 90, color: "var(--color-text-secondary)", flexShrink: 0 }}>{l}</span>
                <span style={{ color: i === 1 ? "var(--color-primary)" : "var(--color-text)", fontFamily: "var(--font-family-mono)", cursor: i === 1 ? "pointer" : "default" }}
                  onClick={() => { if (i === 1) { navigator.clipboard.writeText("5719020097201298888"); toast.success("银行账号已复制"); } }}>
                  {v}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 10, padding: "8px 12px", background: "var(--color-danger-bg)", borderRadius: 6 }}>
              ⚠️ 请在转账备注中注明您的 3cloud 账号邮箱（demo@test.com），以便财务对账。对公转账到账后需人工审核，预计 1-3 个工作日到账。
            </div>
          </div>
        )}

        {isTransfer && !showAudit && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: 14, color: "#1a1a1a", marginBottom: 12 }}>📎 上传转账凭证（可选）</h4>
            <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed var(--color-border)", borderRadius: 10, padding: 24, textAlign: "center", cursor: "pointer" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>拖拽或点击 <strong style={{ color: "var(--color-primary)" }}>上传转账凭证</strong></div>
              <div style={{ fontSize: 12, color: "#bbb", marginTop: 4 }}>支持 JPG / PNG / PDF，不超过 10MB</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }} />
            {uploadFile && (
              <div style={{ marginTop: 12, padding: 12, background: "#f0f9f0", borderRadius: 8, border: "1px solid var(--color-success-border)", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>📄</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: "var(--color-text)" }}>{uploadFile.name}</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{(uploadFile.size / 1024).toFixed(1)} KB</div></div>
                <span onClick={() => setUploadFile(null)} style={{ cursor: "pointer", color: "var(--color-danger-text)", fontSize: 12 }}>✕ 移除</span>
              </div>
            )}
          </div>
        )}

        {showAudit && (
          <div style={{ marginTop: 16, padding: 16, background: "#fff8e1", borderRadius: 10, border: "1px solid #ffe082" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>⏳</span>
              <div><h4 style={{ fontSize: 14, color: "var(--color-warning-text)", marginBottom: 4 }}>对公转账审核中</h4><p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>您于 2026-08-05 提交了 {auditAmt} 的对公转账申请，预计 1-3 个工作日到账</p></div>
            </div>
            <div style={{ marginTop: 12, height: 4, background: "#ffe082", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: "60%", background: "#f57c00", borderRadius: 2 }} />
            </div>
          </div>
        )}

        <button onClick={handleSubmit} disabled={!val || val <= 0}
          style={{ width: "100%", height: 44, border: "none", borderRadius: 8, fontSize: 16, cursor: val > 0 ? "pointer" : "not-allowed", background: val > 0 ? (isTransfer ? "#22c55e" : "var(--color-primary)") : "var(--color-disabled-bg)", color: val > 0 ? "#fff" : "#bbb", marginTop: isTransfer ? 16 : 0 }}>
          {isTransfer ? "提交审核" : "立即充值"}
        </button>

        <div style={{ textAlign: "right", marginTop: 16 }}>
          <a href="#records" style={{ fontSize: 13, color: "var(--color-primary)", textDecoration: "none" }}>充值记录 →</a>
        </div>
      </div>

      {/* Records */}
      <div id="records" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>📋 充值记录 <HelpIcon text="历史充值记录" /></h3>
        <div style={panel}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["时间","金额","支付方式","状态"].map(h => <th key={h} style={{ textAlign: "left", padding: "14px 16px", background: "var(--color-table-header-bg)", color: "var(--color-text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--color-divider)" }}>{h}</th>)}</tr></thead>
              <tbody>
                {RECORDS.map(r => (
                  <tr key={r.id}><td style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-divider-light)" }}>{r.time}</td><td style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-divider-light)" }}>¥{r.amount.toLocaleString()}</td><td style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-divider-light)" }}>{r.method}</td><td style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-divider-light)" }}><StatusBadge status={r.status}>{r.text}</StatusBadge></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

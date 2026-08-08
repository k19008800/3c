import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

interface BankAccount { id: number; agent_id: number; agent_name: string; bank_name: string; account_number: string; account_holder: string; created_at: string; }
interface TaxConfig { tax_rate: number; tax_threshold: number; vat_rate: number; effective_date: string; }
interface TaxHistory { id: number; tax_rate: number; tax_threshold: number; vat_rate: number; effective_date: string; operator_name: string; created_at: string; }

export default function AdminTaxBankingPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"tax" | "bank">("tax");
  const [taxConfig, setTaxConfig] = useState<TaxConfig>({ tax_rate: 20, tax_threshold: 800, vat_rate: 6, effective_date: "" });
  const [taxHistory, setTaxHistory] = useState<TaxHistory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [calcAmount, setCalcAmount] = useState(10000);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/admin/tax-banking/config").then(r => setTaxConfig(r.data?.data ?? taxConfig)),
      api.get("/admin/tax-banking/history").then(r => setTaxHistory(r.data?.data?.list ?? [])),
      api.get("/admin/tax-banking/bank-accounts").then(r => setBankAccounts(r.data?.data?.list ?? [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function saveTaxConfig() {
    await api.put("/admin/tax-banking/config", taxConfig);
    toast.success("税务配置已保存");
  }

  const taxableIncome = Math.max(0, calcAmount - taxConfig.tax_threshold);
  const taxAmount = Math.round(taxableIncome * taxConfig.tax_rate / 100);
  const afterTax = calcAmount - taxAmount;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>加载中…</div>;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>💰</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>税负与银行账户管理
          <HelpIcon text="配置代理商佣金个税、供应商增值税，管理代理商绑定银行账户，提供税务试算工具。" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("tax")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "tax" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "tax" ? "#eef2ff" : "var(--color-panel)", color: tab === "tax" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>💰 税务配置</button>
        <button onClick={() => setTab("bank")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "bank" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "bank" ? "#eef2ff" : "var(--color-panel)", color: tab === "bank" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>🏦 银行账户</button>
      </div>

      {tab === "tax" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>代理佣金个税配置 <HelpIcon text="配置佣金个税税率和起征点。" /></h3>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <span style={{ width: 120, fontSize: 13, color: "#666" }}>个税税率 (%)</span>
              <input type="number" value={taxConfig.tax_rate} onChange={e => setTaxConfig({...taxConfig, tax_rate: Number(e.target.value)})}
                style={{ width: 100, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <span style={{ width: 120, fontSize: 13, color: "#666" }}>起征点 (¥)</span>
              <input type="number" value={taxConfig.tax_threshold} onChange={e => setTaxConfig({...taxConfig, tax_threshold: Number(e.target.value)})}
                style={{ width: 100, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>增值税配置 <HelpIcon text="配置平台供应商增值税税率。" /></h3>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <span style={{ width: 120, fontSize: 13, color: "#666" }}>增值税税率 (%)</span>
              <input type="number" value={taxConfig.vat_rate} onChange={e => setTaxConfig({...taxConfig, vat_rate: Number(e.target.value)})}
                style={{ width: 100, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", gridColumn: "1/-1" }}>
            <button onClick={saveTaxConfig} style={{ padding: "8px 24px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, marginBottom: 16 }}>保存税务配置</button>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>税务试算 <HelpIcon text="输入佣金金额预览税前/个税/税后金额。" /></h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "#666" }}>佣金金额 (¥)</span>
              <input type="number" value={calcAmount} onChange={e => setCalcAmount(Number(e.target.value))}
                style={{ width: 150, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} />
            </div>
            <div style={{ background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}><span>税前佣金金额：</span><span>¥{calcAmount.toLocaleString()}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}><span>起征点：</span><span>¥{taxConfig.tax_threshold.toLocaleString()}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}><span>应纳税所得额：</span><span>¥{taxableIncome.toLocaleString()}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}><span>适用税率：</span><span>{taxConfig.tax_rate}%</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}><span>应扣个税：</span><span style={{ color: "#e53935" }}>¥{taxAmount.toLocaleString()}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", fontSize: 16, fontWeight: 700, borderTop: "1px dashed #b7eb8f", marginTop: 8 }}>
                <span>税后实付金额：</span><span style={{ color: "#22c55e" }}>¥{afterTax.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {taxHistory.length > 0 && (
            <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", gridColumn: "1/-1" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>历史税率变更记录</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#fafafa" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>生效日期</th>
                  <th style={{ padding: "8px 12px", textAlign: "center" }}>个税税率</th>
                  <th style={{ padding: "8px 12px", textAlign: "center" }}>起征点</th>
                  <th style={{ padding: "8px 12px", textAlign: "center" }}>增值税</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>变更人</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>变更时间</th>
                </tr></thead>
                <tbody>
                  {taxHistory.map(h => (
                    <tr key={h.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "8px 12px" }}>{h.effective_date}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>{h.tax_rate}%</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>¥{h.tax_threshold}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>{h.vat_rate}%</td>
                      <td style={{ padding: "8px 12px" }}>{h.operator_name}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "#888" }}>{new Date(h.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "bank" && (
        <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#fafafa" }}>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>代理商</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>银行名称</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>卡号</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>持卡人</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>绑定时间</th>
            </tr></thead>
            <tbody>
              {bankAccounts.map(a => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "8px 14px", fontWeight: 500 }}>{a.agent_name}</td>
                  <td style={{ padding: "8px 14px" }}>{a.bank_name}</td>
                  <td style={{ padding: "8px 14px", fontFamily: "monospace", letterSpacing: 2, fontSize: 12 }}>{a.account_number.replace(/.(?=.{4})/g, "*")}</td>
                  <td style={{ padding: "8px 14px" }}>{a.account_holder.replace(/(?<=.)./g, "*")}</td>
                  <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {bankAccounts.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无银行账户</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

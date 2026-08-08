import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

interface AffiliateConfig { enabled: boolean; reward_type: string; reward_value: number; reward_cap: number; cookie_days: number; }
interface AffiliateRecord { id: number; inviter_id: number; inviter_name: string; invitee_id: number; invitee_name: string; reward_amount: number; status: string; created_at: string; }

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

export default function AdminAffiliatePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"config" | "records">("config");
  const [config, setConfig] = useState<AffiliateConfig>({ enabled: false, reward_type: "fixed", reward_value: 10, reward_cap: 0, cookie_days: 30 });
  const [records, setRecords] = useState<AffiliateRecord[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get("/admin/affiliate/config").then(r => setConfig(r.data?.data ?? config)).catch(() => {});
    api.get("/admin/affiliate/records", { params: { page } }).then(r => setRecords(r.data?.data?.list ?? [])).catch(() => {});
  }, [page]);

  async function saveConfig() {
    await api.put("/admin/affiliate/config", config);
    toast.success("推荐返利配置已保存");
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>💰</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>推荐返利管理
          <HelpIcon text="配置推荐返利规则（固定额度/消费比例/奖励上限），查看返利记录。启用后用户注册时输入推荐码可获得返利。" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("config")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "config" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "config" ? "#eef2ff" : "var(--color-panel)", color: tab === "config" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>⚙️ 返利配置</button>
        <button onClick={() => setTab("records")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "records" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "records" ? "#eef2ff" : "var(--color-panel)", color: tab === "records" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>📋 返利记录</button>
      </div>

      {tab === "config" && (
        <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>⚙️ 返利规则配置 <HelpIcon text="配置推荐返利规则，修改后仅对新邀请生效。" /></h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>启用推荐返利 <HelpIcon text="关闭后所有返利活动暂停。" /></span>
            <Toggle on={config.enabled} onChange={v => setConfig({...config, enabled: v})} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>返利类型 <HelpIcon text="固定额度=每次邀请固定奖励；消费比例=按被邀请人消费额百分比。" /></span>
            <select value={config.reward_type} onChange={e => setConfig({...config, reward_type: e.target.value})} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: 13 }}>
              <option value="fixed">固定额度 (¥)</option>
              <option value="percentage">消费比例 (%)</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>返利值</span>
            <input type="number" value={config.reward_value} onChange={e => setConfig({...config, reward_value: Number(e.target.value)})} style={{ width: 100, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, textAlign: "center" }} />
            <span style={{ fontSize: 12, color: "#888" }}>{config.reward_type === "fixed" ? "¥/次" : "%"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>返利上限 <HelpIcon text="单个邀请人累计返利上限（¥），0=不限。" /></span>
            <input type="number" value={config.reward_cap} onChange={e => setConfig({...config, reward_cap: Number(e.target.value)})} style={{ width: 100, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, textAlign: "center" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>Cookie 有效期 (天)</span>
            <input type="number" value={config.cookie_days} onChange={e => setConfig({...config, cookie_days: Number(e.target.value)})} style={{ width: 100, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, textAlign: "center" }} />
          </div>
          <button onClick={saveConfig} style={{ marginTop: 16, padding: "8px 24px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>保存配置</button>
        </div>
      )}

      {tab === "records" && (
        <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#fafafa" }}>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>邀请人</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>被邀请人</th>
              <th style={{ padding: "10px 14px", textAlign: "right" }}>返利金额</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>时间</th>
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "8px 14px" }}>{r.inviter_name}</td>
                  <td style={{ padding: "8px 14px" }}>{r.invitee_name}</td>
                  <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: "#22c55e" }}>¥{(r.reward_amount / 100).toFixed(2)}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>
                    <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, background: r.status === "credited" ? "#f0fdf4" : "#fff7e6", color: r.status === "credited" ? "#22c55e" : "#f59e0b" }}>{r.status === "credited" ? "已到账" : "待发放"}</span>
                  </td>
                  <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无返利记录</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

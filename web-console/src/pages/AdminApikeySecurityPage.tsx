import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

interface ApikeyPolicy {
  min_length: number; max_age_days: number; require_rotation: boolean; rotation_warning_days: number;
  max_keys_per_user: number; ip_restriction_enabled: boolean; expiry_enabled: boolean;
  default_expiry_days: number;
}

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

export default function AdminApikeySecurityPage() {
  const { toast } = useToast();
  const [policy, setPolicy] = useState<ApikeyPolicy>({
    min_length: 32, max_age_days: 365, require_rotation: false, rotation_warning_days: 30,
    max_keys_per_user: 5, ip_restriction_enabled: false, expiry_enabled: true, default_expiry_days: 365,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/apikey-policy").then(r => setPolicy(r.data?.data ?? policy)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function savePolicy() {
    await api.put("/admin/apikey-policy", policy);
    toast.success("API Key 安全策略已更新");
  }

  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" };
  const rlabel: React.CSSProperties = { width: 200, fontSize: 13, color: "#666", flexShrink: 0 };
  const numInput: React.CSSProperties = { width: 100, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, textAlign: "center" };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>加载中…</div>;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🔑</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>API Key 安全策略
          <HelpIcon text="配置 API Key 全局安全策略：密钥长度、过期时间、强制轮换、每个用户最大 Key 数、IP 限制等。" level="page" />
        </span>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>🔑 密钥基本配置</h3>
        <div style={row}>
          <span style={rlabel}>最小密钥长度 <HelpIcon text="生成 API Key 的最小字符数，建议 32+。" /></span>
          <input type="number" value={policy.min_length} onChange={e => setPolicy({...policy, min_length: Number(e.target.value)})} style={numInput} />
          <span style={{ fontSize: 12, color: "#888" }}>字符</span>
        </div>
        <div style={row}>
          <span style={rlabel}>每用户最大 Key 数 <HelpIcon text="每个用户可创建的最大 API Key 数量。" /></span>
          <input type="number" value={policy.max_keys_per_user} onChange={e => setPolicy({...policy, max_keys_per_user: Number(e.target.value)})} style={numInput} />
        </div>
        <div style={row}>
          <span style={rlabel}>密钥最大有效天数</span>
          <input type="number" value={policy.max_age_days} onChange={e => setPolicy({...policy, max_age_days: Number(e.target.value)})} style={numInput} />
          <span style={{ fontSize: 12, color: "#888" }}>天 (0=不限制)</span>
        </div>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginTop: 16 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>⏱️ 过期与轮换策略</h3>
        <div style={row}>
          <span style={rlabel}>启用过期策略 <HelpIcon text="开启后 API Key 有默认过期时间，过期后需重新生成。" /></span>
          <Toggle on={policy.expiry_enabled} onChange={v => setPolicy({...policy, expiry_enabled: v})} />
        </div>
        <div style={{...row, opacity: policy.expiry_enabled ? 1 : 0.5}}>
          <span style={rlabel}>默认过期天数</span>
          <input type="number" value={policy.default_expiry_days} onChange={e => setPolicy({...policy, default_expiry_days: Number(e.target.value)})} style={numInput} disabled={!policy.expiry_enabled} />
          <span style={{ fontSize: 12, color: "#888" }}>天</span>
        </div>
        <div style={row}>
          <span style={rlabel}>强制轮换 <HelpIcon text="开启后系统会提醒用户定期更换 API Key。" /></span>
          <Toggle on={policy.require_rotation} onChange={v => setPolicy({...policy, require_rotation: v})} />
        </div>
        <div style={{...row, opacity: policy.require_rotation ? 1 : 0.5}}>
          <span style={rlabel}>轮换提醒 (提前天数) <HelpIcon text="Key 到期前多少天开始提醒用户轮换。" /></span>
          <input type="number" value={policy.rotation_warning_days} onChange={e => setPolicy({...policy, rotation_warning_days: Number(e.target.value)})} style={numInput} disabled={!policy.require_rotation} />
          <span style={{ fontSize: 12, color: "#888" }}>天</span>
        </div>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginTop: 16 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>🌐 IP 限制</h3>
        <div style={row}>
          <span style={rlabel}>IP 限制 <HelpIcon text="开启后用户可绑定 API Key 到指定 IP 地址，仅白名单 IP 可调用。" /></span>
          <Toggle on={policy.ip_restriction_enabled} onChange={v => setPolicy({...policy, ip_restriction_enabled: v})} />
        </div>
      </div>

      <button onClick={savePolicy} style={{ marginTop: 20, padding: "10px 32px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
        保存安全策略
        <HelpIcon text="策略变更后对已存在的 Key 也生效（如过期时间）。强制轮换仅影响新创建的 Key。" />
      </button>
    </div>
  );
}

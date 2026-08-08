import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, useToast } from "@3cloud/shared-ui";

interface RetryConfig { id: number; webhook_id: number; webhook_url: string; max_retries: number; retry_delay_seconds: number; backoff_multiplier: number; enabled: boolean; }

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

export default function AdminWebhookRetryPage() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<RetryConfig[]>([]);
  const [editing, setEditing] = useState<RetryConfig | null>(null);

  useEffect(() => {
    api.get("/admin/webhook-retry").then(r => setConfigs(r.data?.data?.list ?? [])).catch(() => {});
  }, []);

  async function toggleWebhook(id: number, enabled: boolean) {
    await api.put(`/admin/webhook-retry/${id}`, { enabled });
    setConfigs(configs.map(c => c.id === id ? {...c, enabled} : c));
    toast.success(enabled ? "重试已启用" : "重试已禁用");
  }

  async function saveConfig(c: RetryConfig) {
    await api.put(`/admin/webhook-retry/${c.id}`, { max_retries: c.max_retries, retry_delay_seconds: c.retry_delay_seconds, backoff_multiplier: c.backoff_multiplier });
    toast.success("配置已更新");
    setEditing(null);
    const r = await api.get("/admin/webhook-retry");
    setConfigs(r.data?.data?.list ?? []);
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🔄</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>Webhook 重试配置
          <HelpIcon text="配置每个 Webhook 端点的重试策略：最大重试次数、重试间隔、退避乘数。失败后按指数退避自动重试。" level="page" />
        </span>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>Webhook URL</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>最大重试次数</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>首次延迟 (秒)</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>退避乘数</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>最大延迟</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>操作</th>
          </tr></thead>
          <tbody>
            {configs.map(c => {
              const maxDelay = Math.round(c.retry_delay_seconds * Math.pow(c.backoff_multiplier, c.max_retries - 1));
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "8px 14px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 12 }}>{c.webhook_url}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>{c.max_retries}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>{c.retry_delay_seconds}s</td>
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>×{c.backoff_multiplier}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center", fontFamily: "monospace" }}>{maxDelay}s</td>
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>
                    <Toggle on={c.enabled} onChange={v => toggleWebhook(c.id, v)} />
                  </td>
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>
                    <button onClick={() => setEditing(c)} style={{ padding: "2px 10px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer" }}>编辑</button>
                  </td>
                </tr>
              );
            })}
            {configs.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无 Webhook 配置</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setEditing(null)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 460, width: "90%" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>编辑重试配置</h3>
            <div style={{ marginBottom: 12, fontFamily: "monospace", fontSize: 12, color: "#888", wordBreak: "break-all" }}>{editing.webhook_url}</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>最大重试次数</label>
              <input type="number" value={editing.max_retries} onChange={e => setEditing({...editing, max_retries: Number(e.target.value)})}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>首次重试延迟 (秒)</label>
              <input type="number" value={editing.retry_delay_seconds} onChange={e => setEditing({...editing, retry_delay_seconds: Number(e.target.value)})}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>退避乘数</label>
              <input type="number" step="0.5" value={editing.backoff_multiplier} onChange={e => setEditing({...editing, backoff_multiplier: Number(e.target.value)})}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                预估最大延迟：{Math.round(editing.retry_delay_seconds * Math.pow(editing.backoff_multiplier, editing.max_retries - 1))}s
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={{ padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)", cursor: "pointer" }}>取消</button>
              <button onClick={() => saveConfig(editing)} style={{ padding: "8px 20px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

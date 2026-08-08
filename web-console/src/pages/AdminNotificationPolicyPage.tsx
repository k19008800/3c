import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

interface NotifPolicy { id: number; channel: string; channel_label: string; event_type: string; event_label: string; template_id: number | null; template_name: string | null; enabled: boolean; throttle_seconds: number; }

const CHANNELS = ["email", "sms", "in_app", "webhook", "wechat"];
const EVENTS = [
  { key: "user.register", label: "用户注册" }, { key: "user.login", label: "用户登录" },
  { key: "recharge.success", label: "充值成功" }, { key: "balance.low", label: "余额不足" },
  { key: "withdraw.request", label: "提现申请" }, { key: "withdraw.success", label: "提现成功" },
  { key: "invoice.ready", label: "发票开具" }, { key: "ticket.reply", label: "工单回复" },
  { key: "api.limit", label: "API限流通知" }, { key: "system.announcement", label: "系统公告" },
];

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0, position: "relative" }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

export default function AdminNotificationPolicyPage() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<NotifPolicy[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [editing, setEditing] = useState<NotifPolicy | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newChannel, setNewChannel] = useState("email");
  const [newEvent, setNewEvent] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newThrottle, setNewThrottle] = useState(0);

  useEffect(() => {
    api.get("/admin/notification-policies").then(r => setPolicies(r.data?.data?.list ?? [])).catch(() => {});
    api.get("/admin/email-templates").then(r => setTemplates(r.data?.data?.list ?? [])).catch(() => {});
  }, []);

  async function togglePolicy(id: number, enabled: boolean) {
    await api.put(`/admin/notification-policies/${id}`, { enabled });
    setPolicies(policies.map(p => p.id === id ? {...p, enabled} : p));
    toast.success(enabled ? "已启用" : "已禁用");
  }

  async function savePolicy(p: NotifPolicy) {
    await api.put(`/admin/notification-policies/${p.id}`, { template_id: p.template_id, throttle_seconds: p.throttle_seconds });
    toast.success("策略已更新");
    const r = await api.get("/admin/notification-policies");
    setPolicies(r.data?.data?.list ?? []);
    setEditing(null);
  }

  async function createPolicy() {
    if (!newEvent) { toast.error("请选择事件类型"); return; }
    await api.post("/admin/notification-policies", { channel: newChannel, event_type: newEvent, template_id: newTemplateId || null, throttle_seconds: newThrottle });
    toast.success("策略已创建");
    setShowNew(false);
    const r = await api.get("/admin/notification-policies");
    setPolicies(r.data?.data?.list ?? []);
  }

  async function deletePolicy(id: number) {
    if (!confirm("确认删除此通知策略？")) return;
    await api.post(`/admin/notification-policies/${id}/delete`, {});
    toast.success("已删除");
    setPolicies(policies.filter(p => p.id !== id));
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🔔</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>通知策略管理
          <HelpIcon text="配置各个事件类型的通知渠道、模板和节流策略。支持邮件/SMS/站内信/Webhook/微信等多种渠道。" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setShowNew(true)} style={{ padding: "6px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>+ 新建策略</button>
      </div>

      {showNew && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>渠道</label>
              <select value={newChannel} onChange={e => setNewChannel(e.target.value)} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>事件类型</label>
              <select value={newEvent} onChange={e => setNewEvent(e.target.value)} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }}>
                <option value="">选择事件</option>
                {EVENTS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>邮件模板</label>
              <select value={newTemplateId} onChange={e => setNewTemplateId(e.target.value)} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }}>
                <option value="">不使用模板</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>节流(秒)</label>
              <input type="number" value={newThrottle} onChange={e => setNewThrottle(Number(e.target.value))} style={{ width: 80, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, textAlign: "center" }} />
            </div>
            <button onClick={createPolicy} style={{ padding: "6px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>创建</button>
            <button onClick={() => setShowNew(false)} style={{ padding: "6px 16px", background: "var(--color-border)", border: "none", borderRadius: 4, cursor: "pointer" }}>取消</button>
          </div>
        </div>
      )}

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>渠道</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>事件</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>模板</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>节流(秒)</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>操作</th>
          </tr></thead>
          <tbody>
            {policies.map(p => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 14px" }}>{p.channel_label ?? p.channel}</td>
                <td style={{ padding: "8px 14px" }}>{p.event_label ?? p.event_type}</td>
                <td style={{ padding: "8px 14px" }}>{p.template_name ?? "-"}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>{p.throttle_seconds}s</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  <Toggle on={p.enabled} onChange={v => togglePolicy(p.id, v)} />
                </td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  <button onClick={() => setEditing(p)} style={{ padding: "2px 10px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer", marginRight: 4 }}>编辑</button>
                  <button onClick={() => deletePolicy(p.id)} style={{ padding: "2px 10px", border: "1px solid #e53935", borderRadius: 4, background: "var(--color-panel)", color: "#e53935", cursor: "pointer" }}>删除</button>
                </td>
              </tr>
            ))}
            {policies.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无通知策略</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setEditing(null)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 500, width: "90%" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>编辑策略 — {editing.event_label} via {editing.channel_label}</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>邮件模板</label>
              <select value={editing.template_id ?? ""} onChange={e => setEditing({...editing, template_id: Number(e.target.value) || null})} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                <option value="">不使用模板</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>节流时间 (秒)</label>
              <input type="number" value={editing.throttle_seconds} onChange={e => setEditing({...editing, throttle_seconds: Number(e.target.value)})}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={{ padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)", cursor: "pointer" }}>取消</button>
              <button onClick={() => savePolicy(editing)} style={{ padding: "8px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

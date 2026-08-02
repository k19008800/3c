import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * §22.4 用户端 Webhook 配置
 * 对应 SPEC-§22-用户端体验增强.md §22.4
 */

interface Webhook {
  id: number;
  name: string;
  url: string;
  events: string[];
  isEnabled: boolean;
  secret?: string;
  createdAt: string;
}

const EVENT_OPTIONS = [
  { value: "call.completed", label: "调用完成" },
  { value: "recharge.success", label: "充值成功" },
  { value: "balance.low", label: "余额不足" },
  { value: "key.created", label: "Key 创建" },
  { value: "key.deleted", label: "Key 删除" },
  { value: "alert.triggered", label: "告警触发" },
  { value: "model.updated", label: "模型更新" },
];

export default function UserWebhooksPage() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);

  const { data: webhooks, isLoading } = useQuery<Webhook[]>({
    queryKey: ["me-webhooks"],
    queryFn: async () => (await api.get<{ data: Webhook[] }>("/me/webhooks")).data.data,
  });

  const saveMut = useMutation({
    mutationFn: async (data: { name: string; url: string; events: string[]; id?: number }) => {
      if (data.id) return (await api.put(`/me/webhooks/${data.id}`, data)).data;
      return (await api.post("/me/webhooks", data)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-webhooks"] });
      setShowForm(false);
      setEditing(null);
      setNotice({ type: "success", msg: "✅ Webhook 已保存" });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/me/webhooks/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-webhooks"] });
      setNotice({ type: "success", msg: "✅ Webhook 已删除" });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      (await api.patch(`/me/webhooks/${id}`, { isEnabled: enabled })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-webhooks"] });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const openEdit = (wh: Webhook) => {
    setEditing(wh);
    setFormName(wh.name);
    setFormUrl(wh.url);
    setFormEvents(wh.events ?? []);
    setShowForm(true);
  };

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormUrl("");
    setFormEvents([]);
    setShowForm(true);
  };

  const toggleEvent = (event: string) => {
    setFormEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]);
  };

  const handleSave = () => {
    if (!formName.trim() || !formUrl.trim()) return;
    saveMut.mutate({ name: formName, url: formUrl, events: formEvents, id: editing?.id });
  };

  const handleDelete = (id: number) => {
    if (confirm("确认删除此 Webhook？")) deleteMut.mutate(id);
  };

  const card = { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, marginBottom: 4 }}>Webhook 配置</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>事件主动推送至您的服务器</p>
        </div>
        <button onClick={openCreate} style={{ background: "#2563eb", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
          + 新建 Webhook
        </button>
      </div>

      {isLoading && <div style={{ color: "#94a3b8" }}>加载中...</div>}

      {!isLoading && (!webhooks || webhooks.length === 0) && !showForm && (
        <div style={{ ...card, textAlign: "center", padding: 40, color: "#94a3b8" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <p>暂无 Webhook 配置</p>
          <button onClick={openCreate} style={{ background: "#2563eb", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, cursor: "pointer", marginTop: 8 }}>
            创建第一个 Webhook
          </button>
        </div>
      )}

      {/* Webhook 列表 */}
      {webhooks?.map((wh) => (
        <div key={wh.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{wh.name}</span>
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 4,
                background: wh.isEnabled ? "#dcfce7" : "#f1f5f9",
                color: wh.isEnabled ? "#16a34a" : "#94a3b8",
              }}>
                {wh.isEnabled ? "启用" : "禁用"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={wh.isEnabled}
                  onChange={(e) => toggleMut.mutate({ id: wh.id, enabled: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                启用
              </label>
              <button onClick={() => openEdit(wh)} style={{ background: "none", border: "1px solid #e2e8f0", color: "#475569", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>编辑</button>
              <button onClick={() => handleDelete(wh.id)} style={{ background: "none", border: "1px solid #fecaca", color: "#ef4444", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>删除</button>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
            <span style={{ fontWeight: 500 }}>URL：</span>
            <code style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>{wh.url}</code>
          </div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            <span style={{ fontWeight: 500 }}>事件：</span>
            {wh.events?.map((ev) => (
              <span key={ev} style={{ background: "#eff6ff", color: "#2563eb", padding: "2px 8px", borderRadius: 4, marginRight: 6, fontSize: 12 }}>{ev}</span>
            ))}
          </div>
        </div>
      ))}

      {/* 新建/编辑表单 */}
      {showForm && (
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
            {editing ? "编辑 Webhook" : "新建 Webhook"}
          </h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>名称</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
              placeholder="例如：回调通知"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>URL</label>
            <input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
              placeholder="https://your-server.com/webhook"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 8 }}>订阅事件</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EVENT_OPTIONS.map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={formEvents.includes(opt.value)}
                    onChange={() => toggleEvent(opt.value)}
                    style={{ width: 16, height: 16 }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!formName.trim() || !formUrl.trim() || saveMut.isPending}
              style={{ background: "#2563eb", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13, opacity: !formName.trim() || !formUrl.trim() ? 0.6 : 1 }}
            >
              {saveMut.isPending ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}

      {/* 签名说明 */}
      <div style={{ ...card, background: "#f8fafc", fontSize: 13, color: "#64748b" }}>
        <strong>💡 Webhook 签名验证：</strong>
        每个 Webhook 投递会包含 HMAC-SHA256 签名，请验证请求头
        <code style={{ background: "#e2e8f0", padding: "1px 6px", borderRadius: 4, marginLeft: 4 }}>X-Webhook-Signature</code>
        以确保消息来源安全。
      </div>

      {notice && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 1100,
          padding: "12px 20px", borderRadius: 8, color: "#fff",
          background: notice.type === "success" ? "#16a34a" : "#dc2626",
          boxShadow: "0 4px 12px rgba(0,0,0,.15)",
        }}>
          {notice.msg}
          <button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>×</button>
        </div>
      )}
    </div>
  );
}

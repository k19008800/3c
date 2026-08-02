import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * §32.1 全局 Webhook 管理页面
 * 对齐 docs/ref-32-sso-integration.md
 */

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const icon = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;

const WEBHOOK_EVENTS = [
  "user.created", "user.deleted", "user.updated",
  "recharge.completed", "recharge.refunded",
  "withdraw.created", "withdraw.completed",
  "agent.commission_settled",
  "alert.triggered",
  "model.price_changed",
] as const;

export default function AdminWebhooksPage() {
  const qc = useQueryClient();
  const [help, setHelp] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[], secret: "", retryCount: 3, timeoutMs: 5000 });
  const [logWebhookId, setLogWebhookId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const listQ = useQuery({
    queryKey: ["admin/webhooks"],
    queryFn: () => api.get("/admin/webhooks").then((r) => r.data.data),
  });

  const logsQ = useQuery({
    queryKey: ["admin/webhooks/logs", logWebhookId],
    queryFn: () => api.get(`/admin/webhooks/${logWebhookId}/logs`).then((r) => r.data.data),
    enabled: !!logWebhookId,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const body = { ...form, secret: form.secret || undefined };
      if (editId) return api.put(`/admin/webhooks/${editId}`, body);
      return api.post("/admin/webhooks", body);
    },
    onSuccess: () => {
      setNotice({ type: "success", msg: editId ? "Webhook 已更新" : "Webhook 已创建" });
      setEditId(null); setForm({ name: "", url: "", events: [], secret: "", retryCount: 3, timeoutMs: 5000 });
      qc.invalidateQueries({ queryKey: ["admin/webhooks"] });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/webhooks/${id}`),
    onSuccess: () => { setNotice({ type: "success", msg: "Webhook 已删除" }); qc.invalidateQueries({ queryKey: ["admin/webhooks"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/admin/webhooks/${id}/toggle`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin/webhooks"] }),
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const testMut = useMutation({
    mutationFn: (id: number) => api.post(`/admin/webhooks/${id}/test`),
    onSuccess: (r) => setTestResult(r.data.data),
    onError: (e) => setTestResult({ status: "error", body: extractError(e) }),
  });

  const toggleEvent = (evt: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(evt) ? f.events.filter((e) => e !== evt) : [...f.events, evt],
    }));
  };

  const webhooks = listQ.data?.list ?? [];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        全局 Webhook <span onClick={() => setHelp("全局 Webhook 管理：创建配置后可接收平台事件推送（如用户注册/充值成功/告警触发等）。支持 HMAC 签名验证和自动重试。")} style={icon} title="帮助">[?]</span>
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>§32.1 事件推送 · HMAC 签名 · 自动重试</p>

      {notice && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", background: notice.type === "success" ? "#d1fae5" : "#fee2e2", color: notice.type === "success" ? "#065f46" : "#991b1b" }}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit" }}>×</button>
        </div>
      )}

      {/* 新建/编辑表单 */}
      <div style={{ ...card, marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14 }}>{editId !== null ? "编辑 Webhook" : "新建 Webhook"}</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>名称 *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>回调 URL *</label>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>签名密钥（留空自动生成）</label>
            <input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>重试次数</label>
              <input type="number" value={form.retryCount} onChange={(e) => setForm({ ...form, retryCount: Number(e.target.value) })} min={0} max={5} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>超时 (ms)</label>
              <input type="number" value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })} min={1000} max={30000} step={1000} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>订阅事件 *</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WEBHOOK_EVENTS.map((evt) => (
              <label key={evt} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: form.events.includes(evt) ? "#dbeafe" : "#f1f5f9", border: "1px solid #cbd5e1" }}>
                <input type="checkbox" checked={form.events.includes(evt)} onChange={() => toggleEvent(evt)} style={{ margin: 0 }} />
                {evt}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name || !form.url || form.events.length === 0} style={{ ...btnBase, background: "#2563eb", color: "#fff", opacity: saveMut.isPending ? 0.6 : 1 }}>{saveMut.isPending ? "保存中..." : editId !== null ? "更新" : "创建"}</button>
          {editId !== null && (
            <button onClick={() => { setEditId(null); setForm({ name: "", url: "", events: [], secret: "", retryCount: 3, timeoutMs: 5000 }); }} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>取消</button>
          )}
        </div>
      </div>

      {/* Webhook 列表 */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {listQ.isLoading ? <p style={{ padding: 20, color: "#94a3b8" }}>加载中...</p> : webhooks.length === 0 ? (
          <p style={{ padding: 20, color: "#94a3b8" }}>暂无 Webhook 配置。</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>名称</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>URL</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>事件数</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>状态</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>上次触发</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w: any, i: number) => (
                <tr key={w.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "10px 16px", color: "#334155", fontWeight: 500 }}>{w.name}</td>
                  <td style={{ padding: "10px 16px", color: "#64748b", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.url}</td>
                  <td style={{ padding: "10px 16px", color: "#64748b" }}>{(() => { try { return JSON.parse(w.events).length; } catch { return 0; } })()}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <button onClick={() => toggleMut.mutate({ id: w.id, isActive: !w.isActive })} style={{ ...btnBase, fontSize: 12, padding: "4px 10px", background: w.isActive ? "#dcfce7" : "#f1f5f9", color: w.isActive ? "#166534" : "#94a3b8" }}>
                      {w.isActive ? "启用" : "禁用"}
                    </button>
                  </td>
                  <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>{w.lastTriggeredAt ? new Date(w.lastTriggeredAt).toLocaleString("zh-CN") : "-"}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button onClick={() => { setEditId(w.id); setForm({ name: w.name, url: w.url, events: JSON.parse(w.events || "[]"), secret: "", retryCount: w.retryCount, timeoutMs: w.timeoutMs }); }} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", fontSize: 12, padding: "4px 8px" }}>编辑</button>
                      <button onClick={() => testMut.mutate(w.id)} disabled={testMut.isPending} style={{ ...btnBase, background: "#e0f2fe", color: "#0369a1", fontSize: 12, padding: "4px 8px" }}>测试</button>
                      <button onClick={() => setLogWebhookId(logWebhookId === w.id ? null : w.id)} style={{ ...btnBase, background: "#f0fdf4", color: "#166534", fontSize: 12, padding: "4px 8px" }}>日志</button>
                      <button onClick={() => { if (confirm("确认删除此 Webhook？")) delMut.mutate(w.id); }} style={{ ...btnBase, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", fontSize: 12, padding: "4px 8px" }}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 测试结果 */}
      {testResult && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>测试结果</h4>
            <button onClick={() => setTestResult(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 8px" }}>关闭</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <div>状态：<span style={{ color: testResult.status === "success" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{testResult.status}</span></div>
            {testResult.statusCode && <div>状态码：{testResult.statusCode}</div>}
            {testResult.latencyMs !== undefined && <div>耗时：{testResult.latencyMs}ms</div>}
            <div style={{ background: "#1e293b", color: "#e2e8f0", padding: 12, borderRadius: 6, marginTop: 8, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{testResult.body || "(空)"}</div>
          </div>
        </div>
      )}

      {/* 投递日志 */}
      {logWebhookId && (
        <div style={{ ...card, marginTop: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14 }}>投递日志</h4>
          {logsQ.isLoading ? (
            <p style={{ color: "#94a3b8" }}>加载中...</p>
          ) : (logsQ.data?.list ?? []).length === 0 ? (
            <p style={{ color: "#94a3b8" }}>暂无投递记录。</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>事件</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>状态</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>状态码</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>耗时</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>尝试</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>时间</th>
                </tr>
              </thead>
              <tbody>
                {(logsQ.data?.list ?? []).map((l: any, i: number) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "8px 12px", color: "#334155" }}>{l.event}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4, background: l.status === "success" ? "#dcfce7" : l.status === "pending" ? "#fef3c7" : "#fee2e2", color: l.status === "success" ? "#166534" : l.status === "pending" ? "#92400e" : "#991b1b" }}>{l.status}</span>
                    </td>
                    <td style={{ padding: "8px 12px", color: "#64748b" }}>{l.responseCode ?? "-"}</td>
                    <td style={{ padding: "8px 12px", color: "#64748b" }}>{l.latencyMs != null ? `${l.latencyMs}ms` : "-"}</td>
                    <td style={{ padding: "8px 12px", color: "#64748b" }}>#{l.attempt}</td>
                    <td style={{ padding: "8px 12px", color: "#64748b", fontSize: 12 }}>{new Date(l.created_at).toLocaleString("zh-CN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {help && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setHelp("")}>
          <div style={{ ...card, width: 480 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: "0 0 8px" }}>帮助 · Webhook</h4>
            <p style={{ color: "#475569", lineHeight: 1.7, margin: 0 }}>{help}</p>
            <button onClick={() => setHelp("")} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", marginTop: 16 }}>关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}

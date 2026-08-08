import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, Table, StatusBadge, Pagination, useToast, Modal, ConfirmPopover } from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/**
 * §32.1 全局 Webhook 管理页面
 * 对齐 docs/ref-32-sso-integration.md
 */

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

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
  const { toast } = useToast();
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[], secret: "", retryCount: 3, timeoutMs: 5000 });
  const [logWebhookId, setLogWebhookId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [testModal, setTestModal] = useState(false);
  const [page, setPage] = useState(1);

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
      toast.success(editId ? "Webhook 已更新" : "Webhook 已创建");
      setEditId(null); setForm({ name: "", url: "", events: [], secret: "", retryCount: 3, timeoutMs: 5000 });
      qc.invalidateQueries({ queryKey: ["admin/webhooks"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/webhooks/${id}`),
    onSuccess: () => { toast.success("Webhook 已删除"); qc.invalidateQueries({ queryKey: ["admin/webhooks"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/admin/webhooks/${id}/toggle`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin/webhooks"] }),
    onError: (e) => toast.error(extractError(e)),
  });

  const testMut = useMutation({
    mutationFn: (id: number) => api.post(`/admin/webhooks/${id}/test`),
    onSuccess: (r) => { setTestResult(r.data.data); setTestModal(true); },
    onError: (e) => { setTestResult({ status: "error", body: extractError(e) }); setTestModal(true); },
  });

  const toggleEvent = (evt: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(evt) ? f.events.filter((e) => e !== evt) : [...f.events, evt],
    }));
  };

  const webhooks = listQ.data?.list ?? [];

  const columns: ColumnDef[] = [
    { key: "name", title: "名称", dataIndex: "name" },
    { key: "url", title: "URL", dataIndex: "url", render: (v) => <span style={{ color: "var(--color-text-secondary)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>{String(v ?? "")}</span> },
    { key: "events", title: "事件数", dataIndex: "events", render: (v) => { try { return JSON.parse(String(v ?? "[]")).length; } catch { return 0; } } },
    { key: "isActive", title: "状态", dataIndex: "isActive", render: (v, record) => (
      <button onClick={(e) => { e.stopPropagation(); toggleMut.mutate({ id: (record as any).id, isActive: !(record as any).isActive }); }} style={{ ...btnBase, fontSize: 12, padding: "4px 10px", background: (record as any).isActive ? "var(--color-success-bg)" : "var(--color-bg)", color: (record as any).isActive ? "var(--color-success-text)" : "#94a3b8" }}>
        {(record as any).isActive ? "启用" : "禁用"}
      </button>
    ) },
    { key: "lastTriggeredAt", title: "上次触发", dataIndex: "lastTriggeredAt", render: (v) => v ? new Date(v as string).toLocaleString("zh-CN") : "-" },
    { key: "actions", title: "操作", render: (_, record) => (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button onClick={() => { setEditId((record as any).id); setForm({ name: (record as any).name, url: (record as any).url, events: JSON.parse((record as any).events || "[]"), secret: "", retryCount: (record as any).retryCount, timeoutMs: (record as any).timeoutMs }); }} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", border: `1px solid var(--color-border)`, fontSize: 12, padding: "4px 8px" }}>编辑</button>
        <button onClick={() => testMut.mutate((record as any).id)} disabled={testMut.isPending} style={{ ...btnBase, background: "#e0f2fe", color: "#0369a1", fontSize: 12, padding: "4px 8px" }}>测试</button>
        <button onClick={() => setLogWebhookId(logWebhookId === (record as any).id ? null : (record as any).id)} style={{ ...btnBase, background: "#f0fdf4", color: "var(--color-success-text)", fontSize: 12, padding: "4px 8px" }}>日志</button>
        <ConfirmPopover title="确认删除此 Webhook？" description="此操作不可撤销" onConfirm={() => delMut.mutate((record as any).id)}>
          <button style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", border: `1px solid #fca5a5`, fontSize: 12, padding: "4px 8px" }}>删除</button>
        </ConfirmPopover>
      </div>
    ) },
  ];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        全局 Webhook
        <HelpIcon text="全局 Webhook 管理：创建配置后可接收平台事件推送（如用户注册/充值成功/告警触发等）。支持 HMAC 签名验证和自动重试。" level="page" />
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>§32.1 事件推送 · HMAC 签名 · 自动重试</p>

      {/* 新建/编辑表单 */}
      <div style={{ ...card, marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14 }}>{editId !== null ? "编辑 Webhook" : "新建 Webhook"}</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>名称 *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>回调 URL *</label>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>签名密钥（留空自动生成）</label>
            <input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>重试次数</label>
              <input type="number" value={form.retryCount} onChange={(e) => setForm({ ...form, retryCount: Number(e.target.value) })} min={0} max={5} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>超时 (ms)</label>
              <input type="number" value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })} min={1000} max={30000} step={1000} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 14, boxSizing: "border-box" }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#475569" }}>订阅事件 *</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WEBHOOK_EVENTS.map((evt) => (
              <label key={evt} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: form.events.includes(evt) ? "#dbeafe" : "var(--color-bg)", border: `1px solid var(--color-border)` }}>
                <input type="checkbox" checked={form.events.includes(evt)} onChange={() => toggleEvent(evt)} style={{ margin: 0 }} />
                {evt}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: `1px solid var(--color-border)`, paddingTop: 12 }}>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name || !form.url || form.events.length === 0} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", opacity: saveMut.isPending ? 0.6 : 1 }}>{saveMut.isPending ? "保存中..." : editId !== null ? "更新" : "创建"}</button>
          {editId !== null && (
            <button onClick={() => { setEditId(null); setForm({ name: "", url: "", events: [], secret: "", retryCount: 3, timeoutMs: 5000 }); }} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", border: `1px solid var(--color-border)` }}>取消</button>
          )}
        </div>
      </div>

      {/* Webhook 列表 */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <Table
          columns={columns}
          dataSource={webhooks.map((w: any, i: number) => ({ ...w, _idx: i }))}
          loading={listQ.isLoading}
          rowKey="id"
          emptyText="暂无 Webhook 配置。"
        />
        {webhooks.length > 0 && (
          <Pagination
            current={page}
            total={webhooks.length}
            pageSize={20}
            onChange={(p) => setPage(p)}
          />
        )}
      </div>

      {/* 测试结果 Modal */}
      <Modal open={testModal} onClose={() => setTestModal(false)} title="测试结果">
        {testResult && (
          <div style={{ fontSize: 13 }}>
            <div>状态：<span style={{ color: testResult.status === "success" ? "var(--color-success-text)" : "var(--color-danger-text)", fontWeight: 600 }}>{testResult.status}</span></div>
            {testResult.statusCode && <div>状态码：{testResult.statusCode}</div>}
            {testResult.latencyMs !== undefined && <div>耗时：{testResult.latencyMs}ms</div>}
            <div style={{ background: "#1e293b", color: "#e2e8f0", padding: 12, borderRadius: 6, marginTop: 8, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{testResult.body || "(空)"}</div>
          </div>
        )}
      </Modal>

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
                <tr style={{ background: "var(--color-bg)", borderBottom: `1px solid var(--color-border)` }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>事件</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>状态</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>状态码</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>耗时</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>尝试</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>时间</th>
                </tr>
              </thead>
              <tbody>
                {(logsQ.data?.list ?? []).map((l: any, i: number) => (
                  <tr key={l.id} style={{ borderBottom: `1px solid var(--color-border)`, background: i % 2 === 0 ? "var(--color-panel)" : "#fafafa" }}>
                    <td style={{ padding: "8px 12px", color: "var(--color-text)" }}>{l.event}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <StatusBadge status={l.status === "success" ? "success" : l.status === "pending" ? "warning" : "danger"}>
                        {l.status}
                      </StatusBadge>
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--color-text-secondary)" }}>{l.responseCode ?? "-"}</td>
                    <td style={{ padding: "8px 12px", color: "var(--color-text-secondary)" }}>{l.latencyMs != null ? `${l.latencyMs}ms` : "-"}</td>
                    <td style={{ padding: "8px 12px", color: "var(--color-text-secondary)" }}>#{l.attempt}</td>
                    <td style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontSize: 12 }}>{new Date(l.created_at).toLocaleString("zh-CN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

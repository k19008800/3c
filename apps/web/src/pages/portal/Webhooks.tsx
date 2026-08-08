import { useState, useCallback, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import EmptyState from "../../components/EmptyState";
import api from "../../services/api";

/* ==================== Types ==================== */

interface Webhook {
  id: string;
  url: string;
  description: string;
  secret: string;
  events: string[];
  enabled: boolean;
  last_triggered?: string | null;
  lastTriggered?: string | null;
  created_at?: string;
  createdAt?: string;
}

interface EventOption {
  key: string;
  label: string;
}

/* ==================== Constants ==================== */

const AVAILABLE_EVENTS: EventOption[] = [
  { key: "deposit.success", label: "充值到账" },
  { key: "consumption.alert", label: "消费预警" },
  { key: "invoice.created", label: "发票开具" },
  { key: "security.login", label: "登录通知" },
  { key: "security.suspicious", label: "异常登录告警" },
  { key: "ticket.replied", label: "工单回复" },
  { key: "balance.low", label: "余额不足" },
  { key: "key.expiring", label: "Key 即将过期" },
];

const NAV = [
  { to: "/dashboard", icon: "📊", label: "概览" },
  { to: "/team", icon: "👥", label: "团队" },
  { to: "/webhooks", icon: "🔔", label: "Webhooks" },
  { to: "/logs", icon: "📋", label: "日志" },
  { to: "/settings", icon: "⚙️", label: "设置" },
  { to: "/account-deletion", icon: "🗑️", label: "账号注销" },
];

/* ==================== Component ==================== */

export default function WebhooksPage() {
  const location = useLocation();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);

  // Form
  const [formUrl, setFormUrl] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<Set<string>>(new Set());
  const [formEnabled, setFormEnabled] = useState(true);
  const [formError, setFormError] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await api.get<Webhook[]>("/me/webhooks");
      if (error) throw new Error(error);
      setWebhooks(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e.message || "加载 Webhook 列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const openCreate = useCallback(() => {
    setFormUrl("");
    setFormDesc("");
    setFormSecret("");
    setFormEvents(new Set());
    setFormEnabled(true);
    setFormError("");
    setEditingId(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((webhook: Webhook) => {
    setFormUrl(webhook.url);
    setFormDesc(webhook.description);
    setFormSecret("");
    setFormEvents(new Set(webhook.events));
    setFormEnabled(webhook.enabled);
    setFormError("");
    setEditingId(webhook.id);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setFormError("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!formUrl.trim() || !formUrl.startsWith("http")) {
      setFormError("请输入有效的 URL 地址（http/https）");
      return;
    }
    if (formEvents.size === 0) {
      setFormError("请至少选择一个事件");
      return;
    }

    setFormSubmitting(true);
    try {
      const payload = {
        url: formUrl,
        description: formDesc,
        secret: formSecret.trim() || undefined,
        events: Array.from(formEvents),
        enabled: formEnabled,
      };

      if (editingId) {
        const { error } = await api.put(`/me/webhooks/${editingId}`, payload);
        if (error) throw new Error(error);
        showToast("Webhook 已更新");
      } else {
        const { error } = await api.post("/me/webhooks", payload);
        if (error) throw new Error(error);
        showToast("Webhook 已创建");
      }
      setModalOpen(false);
      fetchWebhooks();
    } catch (e: any) {
      setFormError(e.message || "保存失败");
    } finally {
      setFormSubmitting(false);
    }
  }, [formUrl, formDesc, formSecret, formEvents, formEnabled, editingId, showToast, fetchWebhooks]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("删除后无法恢复，确定删除此 Webhook？")) return;
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      try {
        await api.delete(`/me/webhooks/${id}`);
        showToast("Webhook 已删除");
      } catch (e: any) {
        showToast("删除失败");
        fetchWebhooks();
      }
    },
    [showToast, fetchWebhooks],
  );

  const handleToggle = useCallback(async (wh: Webhook) => {
    const newEnabled = !wh.enabled;
    setWebhooks((prev) =>
      prev.map((w) => (w.id === wh.id ? { ...w, enabled: newEnabled } : w)),
    );
    try {
      await api.put(`/me/webhooks/${wh.id}`, { enabled: newEnabled });
      showToast("状态已切换");
    } catch (e: any) {
      showToast("状态切换失败");
      setWebhooks((prev) =>
        prev.map((w) => (w.id === wh.id ? { ...w, enabled: wh.enabled } : w)),
      );
    }
  }, [showToast]);

  const handleTest = useCallback(
    async (id: string) => {
      setTestId(id);
      try {
        await api.post(`/me/webhooks/${id}/test`);
        showToast("测试请求已发送，请检查接收端点");
      } catch (e: any) {
        showToast("测试请求发送失败");
      } finally {
        setTestId(null);
      }
    },
    [showToast],
  );

  const toggleEvent = (key: string) => {
    setFormEvents((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const formatLastTriggered = (wh: Webhook) => wh.lastTriggered || wh.last_triggered || null;
  const formatCreatedAt = (wh: Webhook) => wh.created_at || wh.createdAt || "";

  return (
    <div className="portal-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">3Cloud</div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-item${location.pathname === item.to ? " active" : ""}`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="portal-main">
        <PageHeader
          title="Webhook 管理"
          helpText="配置 Webhook 接收充值、消费、告警等事件通知。创建后可测试发送验证连通性。"
          actions={
            <button className="btn btn-primary" onClick={openCreate}>
              + 创建 Webhook
            </button>
          }
        />

        {loading ? (
          <div className="card" style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
            <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
          </div>
        ) : loadError ? (
          <div className="card" style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <div>{loadError}</div>
          </div>
        ) : webhooks.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="🔔"
              title="暂无 Webhook"
              description="创建 Webhook 以接收平台事件通知"
              action={
                <button className="btn btn-primary" onClick={openCreate}>
                  + 创建 Webhook
                </button>
              }
            />
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>描述</th>
                    <th>收听事件</th>
                    <th>状态</th>
                    <th>最后触发</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map((wh) => (
                    <tr key={wh.id}>
                      <td>
                        <code
                          style={{
                            fontSize: 12,
                            background: "#f3f4f6",
                            padding: "2px 6px",
                            borderRadius: 4,
                            wordBreak: "break-all",
                          }}
                        >
                          {wh.url}
                        </code>
                      </td>
                      <td>{wh.description || "—"}</td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {wh.events.map((e) => (
                            <span
                              key={e}
                              className="badge badge-info"
                              style={{ borderRadius: 4, fontSize: 11 }}
                            >
                              {AVAILABLE_EVENTS.find((ae) => ae.key === e)?.label || e}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={wh.enabled ? "active" : "inactive"}>
                          {wh.enabled ? "启用" : "停用"}
                        </StatusBadge>
                      </td>
                      <td style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
                        {formatLastTriggered(wh) || "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleToggle(wh)}
                          >
                            {wh.enabled ? "停用" : "启用"}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleTest(wh.id)}
                            disabled={testId === wh.id}
                          >
                            {testId === wh.id ? "测试中…" : "测试"}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openEdit(wh)}
                          >
                            编辑
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ color: "#ef4444", borderColor: "#ef4444" }}
                            onClick={() => handleDelete(wh.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create/Edit Modal */}
        <Modal
          open={modalOpen}
          onClose={closeModal}
          title={editingId ? "编辑 Webhook" : "创建 Webhook"}
          footer={
            <>
              <button className="btn btn-outline" onClick={closeModal}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={formSubmitting}>
                {formSubmitting ? "保存中…" : editingId ? "保存修改" : "创建"}
              </button>
            </>
          }
        >
          {formError && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: "8px 12px",
                borderRadius: 6,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              {formError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              Webhook URL <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://your-server.com/webhooks/3cloud"
            />
          </div>

          <div className="form-group">
            <label className="form-label">描述</label>
            <input
              type="text"
              className="form-input"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="用于区分不同环境的 Webhook"
            />
          </div>

          <div className="form-group">
            <label className="form-label">签名密钥（可选）</label>
            <input
              type="text"
              className="form-input"
              value={formSecret}
              onChange={(e) => setFormSecret(e.target.value)}
              placeholder="用于验证 Webhook 请求来源"
            />
            <div className="form-hint">
              设置后 Webhook 请求将携带签名头，用于验证请求来源
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              收听事件 <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {AVAILABLE_EVENTS.map((evt) => (
                <div
                  key={evt.key}
                  onClick={() => toggleEvent(evt.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${
                      formEvents.has(evt.key) ? "var(--color-primary)" : "#e5e7eb"
                    }`,
                    cursor: "pointer",
                    background: formEvents.has(evt.key)
                      ? "rgba(79,110,247,0.06)"
                      : "transparent",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formEvents.has(evt.key)}
                    readOnly
                    style={{ accentColor: "var(--color-primary)" }}
                  />
                  {evt.label}
                </div>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={formEnabled}
              onChange={(e) => setFormEnabled(e.target.checked)}
              style={{ accentColor: "var(--color-primary)", width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>启用此 Webhook</span>
          </div>
        </Modal>

        {/* Toast */}
        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}

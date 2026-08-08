/**
 * UserWebhooksPage — Webhook 管理
 *
 * Features:
 * - Webhook configuration list
 * - Create/Edit/Test/Delete webhooks
 * - Webhook URL, description, events, status
 */
"use client";

import { useState, useCallback, useMemo } from "react";
import { HelpIcon, Table, ColumnDef, StatusBadge, EmptyState, ConfirmPopover } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

interface Webhook {
  id: string;
  url: string;
  description: string;
  events: string[];
  enabled: boolean;
  lastTriggered: string | null;
  createdAt: string;
}

const MOCK_WEBHOOKS: Webhook[] = [
  {
    id: "1", url: "https://api.example.com/webhooks/3cloud",
    description: "生产环境消费通知",
    events: ["deposit.success", "consumption.alert", "invoice.created"],
    enabled: true, lastTriggered: "2026-08-05 14:30", createdAt: "2026-07-01 10:00",
  },
  {
    id: "2", url: "https://dev.example.com/hooks/3cloud",
    description: "开发环境告警",
    events: ["security.login", "security.suspicious"],
    enabled: false, lastTriggered: null, createdAt: "2026-07-15 16:20",
  },
];

const AVAILABLE_EVENTS = [
  { key: "deposit.success", label: "充值到账" },
  { key: "consumption.alert", label: "消费预警" },
  { key: "invoice.created", label: "发票开具" },
  { key: "security.login", label: "登录通知" },
  { key: "security.suspicious", label: "异常登录" },
  { key: "ticket.replied", label: "工单回复" },
];

export default function UserWebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>(MOCK_WEBHOOKS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);

  // Form state
  const [formUrl, setFormUrl] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formEvents, setFormEvents] = useState<Set<string>>(new Set());
  const [formEnabled, setFormEnabled] = useState(true);
  const [formError, setFormError] = useState("");

  // Toast
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">("info");
  const [toastShow, setToastShow] = useState(false);

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2500);
  }, []);

  const openCreate = useCallback(() => {
    setFormUrl("");
    setFormDesc("");
    setFormEvents(new Set());
    setFormEnabled(true);
    setFormError("");
    setEditingId(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((webhook: Webhook) => {
    setFormUrl(webhook.url);
    setFormDesc(webhook.description);
    setFormEvents(new Set(webhook.events));
    setFormEnabled(webhook.enabled);
    setFormError("");
    setEditingId(webhook.id);
    setModalOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!formUrl.trim() || !formUrl.startsWith("http")) {
      setFormError("请输入有效的 URL 地址");
      return;
    }
    if (formEvents.size === 0) {
      setFormError("请至少选择一个事件");
      return;
    }

    if (editingId) {
      setWebhooks((prev) =>
        prev.map((w) =>
          w.id === editingId
            ? { ...w, url: formUrl, description: formDesc, events: Array.from(formEvents), enabled: formEnabled }
            : w
        )
      );
      showToast("Webhook 已更新");
    } else {
      const newWebhook: Webhook = {
        id: String(Date.now()),
        url: formUrl,
        description: formDesc,
        events: Array.from(formEvents),
        enabled: formEnabled,
        lastTriggered: null,
        createdAt: new Date().toLocaleString("zh-CN"),
      };
      setWebhooks((prev) => [...prev, newWebhook]);
      showToast("Webhook 已创建");
    }
    setModalOpen(false);
  }, [formUrl, formDesc, formEvents, formEnabled, editingId, showToast]);

  const handleDelete = useCallback((id: string) => {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
    showToast("Webhook 已删除", "info");
  }, [showToast]);

  const handleToggle = useCallback((id: string) => {
    setWebhooks((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, enabled: !w.enabled } : w
      )
    );
  }, []);

  const handleTest = useCallback((id: string) => {
    setTestId(id);
    setTimeout(() => {
      setTestId(null);
      showToast("测试请求已发送，请检查接收端点", "info");
    }, 1500);
  }, [showToast]);

  const toggleEvent = (key: string) => {
    setFormEvents((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const columns: ColumnDef<Webhook>[] = [
    { key: "url", title: "URL", dataIndex: "url", render: (v) => (
      <span style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-sm)" }}>
        {String(v)}
      </span>
    )},
    { key: "desc", title: "描述", dataIndex: "description" },
    { key: "events", title: "事件", dataIndex: "events", render: (v) => {
      const events = v as string[];
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {events.map((e) => (
            <span key={e} style={{
              display: "inline-block", padding: "2px 8px", borderRadius: 4,
              background: "rgba(79,110,247,0.08)", color: "var(--color-primary)", fontSize: "var(--font-size-xs)",
              border: "1px solid rgba(79,110,247,0.12)",
            }}>
              {AVAILABLE_EVENTS.find((ae) => ae.key === e)?.label || e}
            </span>
          ))}
        </div>
      );
    }},
    { key: "enabled", title: "状态", dataIndex: "enabled", render: (v) =>
      v ? <StatusBadge status="success">启用</StatusBadge> : <StatusBadge status="default">停用</StatusBadge>
    },
    { key: "lastTriggered", title: "最后触发", dataIndex: "lastTriggered", render: (v) =>
      <span style={{ color: v ? "var(--color-text-secondary)" : "#bbb" }}>{String(v ?? "—")}</span>
    },
    { key: "action", title: "操作", render: (_, record) => (
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={(e) => { e.stopPropagation(); handleToggle(record.id); }}
          style={{
            padding: "4px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
            background: "var(--color-panel)", fontSize: "var(--font-size-sm)", cursor: "pointer",
            color: "var(--color-text-secondary)",
          }}
        >
          {record.enabled ? "停用" : "启用"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleTest(record.id); }}
          disabled={testId === record.id}
          style={{
            padding: "4px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
            background: "var(--color-panel)", fontSize: "var(--font-size-sm)", cursor: testId === record.id ? "not-allowed" : "pointer",
            color: "var(--color-text-secondary)", opacity: testId === record.id ? 0.5 : 1,
          }}
        >
          {testId === record.id ? "测试中…" : "测试"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); openEdit(record); }}
          style={{
            padding: "4px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
            background: "var(--color-panel)", fontSize: "var(--font-size-sm)", cursor: "pointer",
            color: "var(--color-primary)",
          }}
        >
          编辑
        </button>
        <ConfirmPopover title="确认删除" message="删除后无法恢复，确定要删除此 Webhook？"
          onConfirm={() => handleDelete(record.id)}>
          <button style={{
            padding: "4px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-danger-text)",
            background: "var(--color-panel)", fontSize: "var(--font-size-sm)", cursor: "pointer",
            color: "var(--color-danger-text)",
          }}>
            删除
          </button>
        </ConfirmPopover>
      </div>
    )},
  ];

  return (
    <>
      <PortalTopbar title="Webhook 管理" helpHint="配置 Webhook 接收充值、消费、告警等事件通知" />

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div />
        <button
          onClick={openCreate}
          style={{
            padding: "10px 20px", borderRadius: "var(--radius-lg)", background: "var(--color-primary)",
            color: "#fff", border: "none", fontSize: "var(--font-size-base)", cursor: "pointer",
          }}
        >
          + 创建 Webhook
        </button>
      </div>

      <div style={{
        background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-panel)", overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h3 style={{
            fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            Webhook 列表
            <HelpIcon text="管理接收平台事件的 Webhook 端点" />
          </h3>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            共 {webhooks.length} 条
          </span>
        </div>
        <Table
          columns={columns}
          dataSource={webhooks}
          rowKey="id"
          emptyText="暂无 Webhook，点击右上角创建"
        />
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "var(--color-modal-overlay)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              background: "var(--color-panel)", borderRadius: "var(--radius-2xl)",
              width: 560, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto",
              boxShadow: "var(--shadow-modal)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <h3 style={{ fontSize: "var(--font-size-xl)", fontWeight: 600 }}>
                {editingId ? "编辑 Webhook" : "创建 Webhook"}
              </h3>
              <button onClick={() => setModalOpen(false)} style={{
                background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer",
              }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {formError && (
                <div style={{
                  background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)",
                  borderRadius: "var(--radius-md)", padding: "8px 12px", marginBottom: 16,
                  fontSize: "var(--font-size-md)", color: "var(--color-danger-text)",
                }}>
                  {formError}
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: "var(--font-size-md)", color: "var(--color-text)", marginBottom: 6 }}>
                  Webhook URL <span style={{ color: "var(--color-danger-text)" }}>*</span>
                </label>
                <input
                  type="text" value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://your-server.com/webhooks/3cloud"
                  style={{
                    width: "100%", padding: "10px 14px", border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-lg)", fontSize: "var(--font-size-base)",
                    background: "var(--color-panel)", color: "var(--color-text)", outline: "none",
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: "var(--font-size-md)", color: "var(--color-text)", marginBottom: 6 }}>
                  描述
                </label>
                <input
                  type="text" value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="用于区分不同环境的 Webhook"
                  style={{
                    width: "100%", padding: "10px 14px", border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-lg)", fontSize: "var(--font-size-base)",
                    background: "var(--color-panel)", color: "var(--color-text)", outline: "none",
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: "var(--font-size-md)", color: "var(--color-text)", marginBottom: 8 }}>
                  收听事件 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                  {AVAILABLE_EVENTS.map((event) => (
                    <div
                      key={event.key}
                      onClick={() => toggleEvent(event.key)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                        borderRadius: "var(--radius-lg)", border: `1px solid ${formEvents.has(event.key) ? "var(--color-primary)" : "var(--color-border)"}`,
                        cursor: "pointer", background: formEvents.has(event.key) ? "var(--color-primary-light)" : "var(--color-panel)",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, border: `2px solid ${formEvents.has(event.key) ? "var(--color-primary)" : "var(--color-border)"}`,
                        borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
                        background: formEvents.has(event.key) ? "var(--color-primary)" : "transparent",
                        transition: "all var(--transition-fast)",
                      }}>
                        {formEvents.has(event.key) && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: "var(--font-size-md)", color: "var(--color-text)" }}>{event.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox" checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "var(--color-primary)" }}
                />
                <span style={{ fontSize: "var(--font-size-md)", color: "var(--color-text)" }}>启用</span>
              </div>
            </div>
            <div style={{ padding: "0 24px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  padding: "10px 24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)",
                  background: "var(--color-panel)", color: "var(--color-text)", cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: "10px 24px", borderRadius: "var(--radius-lg)", border: "none",
                  background: "var(--color-primary)", color: "#fff", cursor: "pointer",
                }}
              >
                {editingId ? "保存修改" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastShow && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "10px 20px", borderRadius: "var(--radius-lg)",
          fontSize: "var(--font-size-md)",
          background: toastType === "success" ? "var(--color-success-bg)" :
                      toastType === "error" ? "var(--color-danger-bg)" :
                      "var(--color-primary-light)",
          color: toastType === "success" ? "var(--color-success-text)" :
                  toastType === "error" ? "var(--color-danger-text)" :
                  "var(--color-primary)",
          border: "1px solid " + (toastType === "success" ? "var(--color-success-border)" :
                                  toastType === "error" ? "var(--color-danger-border)" :
                                  "rgba(79,110,247,0.3)"),
          boxShadow: "var(--shadow-toast)",
        }}>
          {toastMsg}
        </div>
      )}
    </>
  );
}

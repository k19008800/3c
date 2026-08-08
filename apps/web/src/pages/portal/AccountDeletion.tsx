// NOTE: 账号注销后端 API 待开发（自注册销申请/冷静期/取消等端点）。
// 当前页面使用本地状态模拟完整流程，后端 API 就绪后替换即可。
import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";

/* ==================== Types ==================== */

type PageView = "normal" | "pending" | "completed";

interface Prerequisites {
  balance: boolean;
  tickets: boolean;
  refund: boolean;
  verified: boolean;
}

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

interface ExportTask {
  id: string;
  time: string;
  size: string;
  scope: number;
  status: "processing" | "completed" | "expired" | "failed";
}

/* ==================== Constants ==================== */

const EXPORT_SCOPES = [
  { key: "profile", label: "个人资料", format: "JSON" },
  { key: "apikeys", label: "API Key 列表（不含 Key 明文）", format: "JSON/CSV" },
  { key: "consumption", label: "消费记录", format: "CSV" },
  { key: "recharge", label: "充值记录", format: "CSV" },
  { key: "invoice", label: "发票记录", format: "CSV" },
  { key: "ticket", label: "工单记录", format: "CSV" },
  { key: "notification", label: "通知记录", format: "JSON" },
  { key: "login", label: "登录记录", format: "CSV" },
];

const NAV = [
  { to: "/dashboard", icon: "📊", label: "概览" },
  { to: "/team", icon: "👥", label: "团队" },
  { to: "/webhooks", icon: "🔔", label: "Webhooks" },
  { to: "/logs", icon: "📋", label: "日志" },
  { to: "/settings", icon: "⚙️", label: "设置" },
  { to: "/account-deletion", icon: "🗑️", label: "账号注销" },
];

/* ==================== Helpers ==================== */

const otpDigits = (value: string, idx: number, val: string) => {
  const replacement = (value.substring(0, idx) + val + value.substring(idx + 1))
    .replace(/\D/g, "")
    .substring(0, 6);
  return replacement;
};

/* ==================== Component ==================== */

export default function AccountDeletion() {
  const location = useLocation();
  const [view, setView] = useState<PageView>("normal");
  const [toast, setToast] = useState("");

  // Export
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScopes, setExportScopes] = useState<Set<string>>(
    new Set(EXPORT_SCOPES.map((s) => s.key)),
  );
  const [exportOtp, setExportOtp] = useState("");
  const [exportQuota, setExportQuota] = useState(1);
  const [exportTasks, setExportTasks] = useState<ExportTask[]>([
    {
      id: "EXP-20260805-001",
      time: "2026-08-05 14:30",
      size: "2.3 MB",
      scope: 7,
      status: "completed",
    },
  ]);

  // Deletion
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionOtp, setDeletionOtp] = useState("");
  const [deletionError, setDeletionError] = useState("");

  // Cancel
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelOtp, setCancelOtp] = useState("");

  // Prerequisites
  const prerequisites: Prerequisites = {
    balance: true,
    tickets: true,
    refund: true,
    verified: true,
  };

  // Countdown
  const [countdown, setCountdown] = useState<Countdown>({
    days: 6,
    hours: 23,
    minutes: 59,
    seconds: 45,
  });
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  /* Export */
  const toggleScope = useCallback((key: string) => {
    setExportScopes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const submitExport = useCallback(() => {
    if (exportOtp.length < 6) return;
    if (exportScopes.size === 0) return;
    setExportOpen(false);
    setExportQuota((q) => q + 1);
    const task: ExportTask = {
      id: `EXP-${Date.now()}`,
      time: new Date().toLocaleString("zh-CN"),
      size: "处理中…",
      scope: exportScopes.size,
      status: "processing",
    };
    setExportTasks((prev) => [task, ...prev]);
    showToast("导出申请已提交");

    setTimeout(() => {
      setExportTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, size: "1.8 MB", status: "completed" as const } : t,
        ),
      );
    }, 2500);
  }, [exportOtp, exportScopes, showToast]);

  /* Deletion */
  const confirmDeletion = useCallback(() => {
    if (!deletionReason.trim()) {
      setDeletionError("请填写注销原因");
      return;
    }
    if (!deletionPassword.trim()) {
      setDeletionError("请输入登录密码确认");
      return;
    }
    if (deletionOtp.length < 6) {
      setDeletionError("请输入完整的邮箱验证码");
      return;
    }
    setDeletionError("");
    setDeletionOpen(false);
    setView("pending");

    const end = new Date();
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 45);
    const update = () => {
      const diff = end.getTime() - Date.now();
      if (diff <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setView("completed");
        return;
      }
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    update();
    countdownRef.current = setInterval(update, 1000);
    showToast("注销申请已提交，冷静期 7 天");
  }, [deletionReason, deletionPassword, deletionOtp, showToast]);

  const confirmCancel = useCallback(() => {
    if (cancelOtp.length < 6) return;
    setCancelOpen(false);
    setView("normal");
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    showToast("注销已取消，账号恢复正常");
  }, [cancelOtp, showToast]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const allReady = Object.values(prerequisites).every(Boolean);

  /* ============ Render view ============ */

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
          title={view === "normal" ? "账号安全" : view === "pending" ? "⚠️ 注销确认" : "✅ 注销完成"}
          helpText={
            view === "normal"
              ? "管理账号注销和数据导出。注销后有 7 天冷静期，期间可取消。"
              : view === "pending"
                ? "冷静期内可随时取消注销，届时账号将恢复正常。"
                : "账号已注销，数据将在 30 天后永久删除。"
          }
        />

        {view === "normal" && (
          <>
            {/* Export Section */}
            <div className="card">
              <h3 className="card-title">
                数据可移植性
                <span className="help-icon" title="导出您的个人资料、消费记录、充值记录等数据到本地保存，每月限 3 次">[?]</span>
              </h3>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: 20,
                  borderRadius: 10,
                  marginBottom: 16,
                  background: "linear-gradient(135deg, rgba(79,110,247,0.04), rgba(79,110,247,0.01))",
                  border: "1px solid rgba(79,110,247,0.12)",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "rgba(79,110,247,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  📥
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 4 }}>
                    导出我的数据
                    <span className="help-icon" title="导出个人资料、API Key 信息、消费/充值/发票/工单/通知/登录记录，共 8 类数据，加密 ZIP 下载，72 小时有效">[?]</span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    导出个人资料、消费记录、充值记录等您在本平台的所有数据到本地保存。
                    数据将打包为加密 ZIP 文件，下载链接 72 小时内有效。
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    📊 本月已导出：<strong>{exportQuota}/3</strong> 次
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => setExportOpen(true)}
                    disabled={exportQuota >= 3}
                  >
                    📥 导出我的数据
                  </button>
                </div>
              </div>

              {exportTasks.length > 0 && (
                <div>
                  {exportTasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 16px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        marginBottom: 10,
                        background:
                          task.status === "completed"
                            ? "rgba(102,187,106,0.04)"
                            : task.status === "processing"
                              ? "rgba(255,167,38,0.04)"
                              : "#f5f5f5",
                      }}
                    >
                      <div style={{ fontSize: 24 }}>
                        {task.status === "completed" ? "📦" : "⏳"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--color-text)",
                            marginBottom: 2,
                          }}
                        >
                          导出任务 #{task.id}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          创建时间：{task.time} ·{" "}
                          {task.status === "processing"
                            ? "处理中…"
                            : `文件大小：${task.size}`}{" "}
                          · 范围：{task.scope}/8 项
                        </div>
                        {task.status === "completed" && (
                          <div style={{ fontSize: 12, color: "#ffa726", marginTop: 4 }}>
                            ⏰ 下载链接剩余：<strong>48 小时 15 分钟</strong>
                          </div>
                        )}
                      </div>
                      <div>
                        {task.status === "completed" && (
                          <button className="btn btn-outline btn-sm">📥 下载</button>
                        )}
                        {task.status === "processing" && (
                          <button className="btn btn-outline btn-sm" disabled>
                            处理中
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Deletion Section */}
            <div className="card">
              <h3 className="card-title">
                账号注销
                <span className="help-icon" title="注销后所有 API Key 失效、服务停止。7 天冷静期内可撤销，30 天后数据永久删除">[?]</span>
              </h3>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: 20,
                  borderRadius: 10,
                  marginBottom: 14,
                  background:
                    "linear-gradient(135deg, rgba(229,57,53,0.04), rgba(229,57,53,0.01))",
                  border: "1px solid rgba(229,57,53,0.12)",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "rgba(229,57,53,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  🗑️
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 4 }}>
                    注销我的账号
                    <span className="help-icon" title="注销后所有 API Key 失效，7 天冷静期可撤销，37 天后数据永久删除。注销前请确保余额已清零、工单已关闭">[?]</span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    注销后所有 API Key 将立即失效、所有服务停止。
                    <br />
                    采用<strong>7 天冷静期 + 30 天数据保留期</strong>机制：
                    冷静期内可随时取消注销，超过 37 天后个人数据将永久删除且不可恢复。
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    ⚠️ 注销前请确认：余额已清零、无进行中工单、无审核中退款
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button
                    className="btn btn-danger"
                    onClick={() => setDeletionOpen(true)}
                  >
                    🗑️ 注销账号
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {view === "pending" && (
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
                账号注销待确认
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                您的账号注销申请已于 <strong>2026-08-08 12:30</strong> 提交。
                <br />
                注销将在 <strong>2026-08-15 12:30</strong> 完成。
              </div>
            </div>

            <div
              className="card"
              style={{ textAlign: "center", padding: 24, marginBottom: 20 }}
            >
              <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                ⏳ 剩余冷静期
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                  color: "#ef4444",
                  fontFamily: "monospace",
                }}
              >
                {countdown.days} 天 {String(countdown.hours).padStart(2, "0")} 小时{" "}
                {String(countdown.minutes).padStart(2, "0")} 分钟{" "}
                {String(countdown.seconds).padStart(2, "0")} 秒
              </div>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              <h3 className="card-title">注销前已执行操作</h3>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {[
                  "所有 API Key 已失效（3 个 Key 已标记 revoked）",
                  "所有活跃会话已退出（2 个设备已下线）",
                  "余额已清零（¥0.00）",
                  "实名认证信息将在 37 天后脱敏处理",
                  "注销完成邮件将发送至 demo@test.com",
                ].map((text, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "8px 0",
                      fontSize: 14,
                      color: "#065f46",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span>✅</span> {text}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button
                className="btn btn-outline"
                style={{ color: "#ffa726", borderColor: "#ffa726" }}
                onClick={() => setCancelOpen(true)}
              >
                ↩️ 取消注销（需邮箱验证）
              </button>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                }}
              >
                取消注销后 API Key 自动恢复启用，账号恢复正常状态
              </div>
            </div>
          </div>
        )}

        {view === "completed" && (
          <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
              账号已注销
            </div>
            <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              您的账号已于 2026-08-15 12:30 正式注销。
              <br />
              数据将在 30 天后（2026-09-14）永久删除。
              <br />
              <br />
              感谢您使用 3Cloud，我们随时欢迎您回来。
            </div>
          </div>
        )}

        {/* Export Modal */}
        <Modal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          title="📥 导出我的数据"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setExportOpen(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={submitExport}>
                提交导出申请
              </button>
            </>
          }
        >
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            选择需要导出的数据类别，数据将打包为加密 ZIP 文件，下载链接 72 小时有效。
          </div>

          {EXPORT_SCOPES.map((scope) => (
            <div
              key={scope.key}
              onClick={() => toggleScope(scope.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 6,
                marginBottom: 4,
                fontSize: 13,
                cursor: "pointer",
                background: exportScopes.has(scope.key)
                  ? "rgba(79,110,247,0.06)"
                  : "#fafafa",
                border: `1px solid ${
                  exportScopes.has(scope.key) ? "var(--color-primary)" : "#e5e7eb"
                }`,
              }}
            >
              <input
                type="checkbox"
                checked={exportScopes.has(scope.key)}
                readOnly
                style={{ accentColor: "var(--color-primary)" }}
              />
              <span style={{ flex: 1 }}>{scope.label}</span>
              <span
                style={{
                  fontSize: 11,
                  color: "#aaa",
                  background: "#eee",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {scope.format}
              </span>
            </div>
          ))}

          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              marginTop: 12,
            }}
          >
            ✅ 共选择 <strong>{exportScopes.size}</strong>/8 项数据 · ⚠️ 本月剩余导出次数：
            <strong>{3 - exportQuota}</strong> 次
          </div>

          <div className="form-group" style={{ marginTop: 20 }}>
            <label className="form-label">邮箱验证码（发送至 demo@test.com）</label>
            <div className="flex-row" style={{ alignItems: "flex-end" }}>
              <div className="flex-row gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={1}
                    inputMode="numeric"
                    value={exportOtp[i] || ""}
                    onChange={(e) =>
                      setExportOtp(otpDigits(exportOtp, i, e.target.value))
                    }
                    style={{
                      width: 44,
                      height: 48,
                      textAlign: "center",
                      fontSize: 20,
                      borderRadius: 6,
                      border: `1px solid ${exportOtp[i] ? "rgba(79,110,247,0.4)" : "#d1d5db"}`,
                      outline: "none",
                    }}
                  />
                ))}
              </div>
              <button className="btn btn-outline btn-sm" style={{ padding: "8px 14px" }}>
                发送验证码
              </button>
            </div>
          </div>
        </Modal>

        {/* Deletion Confirmation Modal */}
        <Modal
          open={deletionOpen}
          onClose={() => {
            setDeletionOpen(false);
            setDeletionError("");
          }}
          title="🗑️ 注销账号"
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setDeletionOpen(false);
                  setDeletionError("");
                }}
              >
                取消
              </button>
              <button className="btn btn-danger" onClick={confirmDeletion} disabled={!allReady}>
                确认注销
              </button>
            </>
          }
        >
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              marginBottom: 16,
            }}
          >
            确定要注销账号？注销后所有服务将不可用。请先确认以下条件：
          </div>

          {[
            {
              key: "balance",
              label: "余额已清零（当前余额：¥0.00）",
              pass: prerequisites.balance,
            },
            {
              key: "tickets",
              label: "无进行中工单（0 个未关闭工单）",
              pass: prerequisites.tickets,
            },
            {
              key: "refund",
              label: "无审核中退款（0 笔退款审核中）",
              pass: prerequisites.refund,
            },
            {
              key: "verified",
              label: "无未完成实名认证（认证状态：已实名）",
              pass: prerequisites.verified,
            },
          ].map((item) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 6,
                marginBottom: 8,
                fontSize: 13,
                border: "1px solid",
                background: item.pass
                  ? "rgba(102,187,106,0.04)"
                  : "rgba(229,57,53,0.04)",
                borderColor: item.pass
                  ? "rgba(102,187,106,0.3)"
                  : "rgba(229,57,53,0.3)",
                color: item.pass ? "#065f46" : "#991b1b",
              }}
            >
              <span>{item.pass ? "✅" : "❌"}</span>
              <span>{item.label}</span>
            </div>
          ))}

          {deletionError && (
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
              {deletionError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">注销原因</label>
            <textarea
              className="form-textarea"
              value={deletionReason}
              onChange={(e) => setDeletionReason(e.target.value)}
              placeholder="请告诉我们您注销的原因（选填）"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label className="form-label">登录密码确认</label>
            <input
              className="form-input"
              type="password"
              value={deletionPassword}
              onChange={(e) => setDeletionPassword(e.target.value)}
              placeholder="请输入登录密码"
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              邮箱验证码（发送至 demo@test.com）
            </label>
            <div className="flex-row" style={{ alignItems: "flex-end" }}>
              <div className="flex-row gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={1}
                    inputMode="numeric"
                    value={deletionOtp[i] || ""}
                    onChange={(e) =>
                      setDeletionOtp(otpDigits(deletionOtp, i, e.target.value))
                    }
                    style={{
                      width: 44,
                      height: 48,
                      textAlign: "center",
                      fontSize: 20,
                      borderRadius: 6,
                      border: `1px solid ${deletionOtp[i] ? "rgba(79,110,247,0.4)" : "#d1d5db"}`,
                      outline: "none",
                    }}
                  />
                ))}
              </div>
              <button className="btn btn-outline btn-sm" style={{ padding: "8px 14px" }}>
                发送验证码
              </button>
            </div>
          </div>
        </Modal>

        {/* Cancel Deletion Modal */}
        <Modal
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title="↩️ 取消账号注销"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setCancelOpen(false)}>
                暂不取消
              </button>
              <button className="btn btn-primary" onClick={confirmCancel}>
                确认取消注销
              </button>
            </>
          }
        >
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            取消后您的账号将恢复正常状态，所有 API Key 将重新启用。
            <br />
            如需取消注销，请输入邮箱验证码确认操作。
          </div>

          <div className="form-group">
            <label className="form-label">
              邮箱验证码（发送至 demo@test.com）
            </label>
            <div className="flex-row" style={{ alignItems: "flex-end" }}>
              <div className="flex-row gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={1}
                    inputMode="numeric"
                    value={cancelOtp[i] || ""}
                    onChange={(e) =>
                      setCancelOtp(otpDigits(cancelOtp, i, e.target.value))
                    }
                    style={{
                      width: 44,
                      height: 48,
                      textAlign: "center",
                      fontSize: 20,
                      borderRadius: 6,
                      border: `1px solid ${cancelOtp[i] ? "rgba(79,110,247,0.4)" : "#d1d5db"}`,
                      outline: "none",
                    }}
                  />
                ))}
              </div>
              <button className="btn btn-outline btn-sm" style={{ padding: "8px 14px" }}>
                发送验证码
              </button>
            </div>
          </div>
        </Modal>

        {/* Toast */}
        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}

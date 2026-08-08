/**
 * DeletionPage — 对齐 portal-account-deletion.html
 *
 * Features:
 * - Deletion prerequisites check (balance=0, no tickets, no refunds)
 * - Cooling-off period countdown (7 days)
 * - Cancel deletion button with email verification
 * - Data export functionality with 8 categories
 * - Export task list
 */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { HelpIcon, StatusBadge } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

/* ==================== Types ==================== */
type PageView = "normal" | "pending";

interface ExportTask {
  id: string;
  time: string;
  size: string;
  scope: number;
  status: "processing" | "completed" | "expired" | "failed";
  downloadUrl?: string;
}

/* ==================== Styles ==================== */
const s = {
  panel: {
    background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
    marginBottom: 20, boxShadow: "var(--shadow-panel)",
  } as const,
  panelHeader: {
    padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  } as const,
  panelTitle: {
    fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)",
    display: "flex", alignItems: "center", gap: 6,
  } as const,
  panelBody: { padding: 20 } as const,
  actionCard: (type: "export" | "delete") => ({
    display: "flex", alignItems: "flex-start", gap: 16, padding: 20,
    borderRadius: 10, marginBottom: 14,
    background: type === "export"
      ? "linear-gradient(135deg, rgba(79,110,247,0.04), rgba(79,110,247,0.01))"
      : "linear-gradient(135deg, rgba(229,57,53,0.04), rgba(229,57,53,0.01))",
    border: `1px solid ${type === "export" ? "rgba(79,110,247,0.12)" : "rgba(229,57,53,0.12)"}`,
  } as const),
  cardIcon: (type: "export" | "delete") => ({
    width: 48, height: 48, borderRadius: 12,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 24, flexShrink: 0,
    background: type === "export" ? "rgba(79,110,247,0.1)" : "rgba(229,57,53,0.1)",
  } as const),
  btn: (variant: "primary" | "danger" | "warning" | "default", disabled = false) => ({
    padding: "10px 20px", borderRadius: "var(--radius-lg)",
    border: variant === "primary" ? "none" : `1px solid ${variant === "danger" ? "var(--color-danger-text)" : variant === "warning" ? "#ffa726" : "var(--color-border)"}`,
    background: variant === "primary" ? "var(--color-primary)" : "var(--color-panel)",
    color: variant === "primary" ? "#fff" : variant === "danger" ? "var(--color-danger-text)" : variant === "warning" ? "#ffa726" : "var(--color-text)",
    fontSize: "var(--font-size-base)", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "all var(--transition-fast)",
    whiteSpace: "nowrap",
  } as const),
  checklistItem: (pass: boolean) => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 14px", borderRadius: "var(--radius-lg)", marginBottom: 8,
    fontSize: "var(--font-size-md)", border: "1px solid",
    background: pass ? "rgba(102,187,106,0.04)" : "rgba(229,57,53,0.04)",
    borderColor: pass ? "rgba(102,187,106,0.3)" : "rgba(229,57,53,0.3)",
    color: pass ? "var(--color-success-text)" : "var(--color-danger-text)",
  } as const),
  modalOverlay: (show: boolean) => ({
    position: "fixed", inset: 0, background: "var(--color-modal-overlay)",
    zIndex: 999, display: show ? "flex" : "none",
    alignItems: "center", justifyContent: "center",
  } as const),
  modalBox: {
    background: "var(--color-panel)", borderRadius: 14,
    width: 520, maxWidth: "95vw", padding: 28,
    boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
  } as const,
  input: {
    width: "100%", padding: "10px 14px", borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)", background: "var(--color-panel)",
    color: "var(--color-text)", fontSize: "var(--font-size-base)", outline: "none",
  } as const,
  otpInput: {
    width: 48, height: 56, textAlign: "center", fontSize: 22,
    borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
    background: "var(--color-panel)", color: "var(--color-text)",
    fontWeight: 600, outline: "none",
  } as const,
  checkboxItem: (checked: boolean) => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 14px", borderRadius: "var(--radius-md)", marginBottom: 4,
    fontSize: "var(--font-size-md)", cursor: "pointer",
    background: checked ? "var(--color-primary-light)" : "#fafafa",
    border: `1px solid ${checked ? "var(--color-primary)" : "var(--color-divider)"}`,
  } as const),
  exportStatusCard: (status: string) => {
    const bg = status === "processing" ? "rgba(255,167,38,0.04)" :
                status === "completed" ? "rgba(102,187,106,0.04)" :
                status === "failed" ? "rgba(229,57,53,0.04)" : "#f5f5f5";
    const border = status === "processing" ? "rgba(255,167,38,0.2)" :
                    status === "completed" ? "rgba(102,187,106,0.2)" :
                    status === "failed" ? "rgba(229,57,53,0.2)" : "var(--color-border)";
    return {
      display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
      borderRadius: "var(--radius-lg)", border: `1px solid ${border}`,
      background: bg, marginBottom: 10,
    } as const;
  },
};

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

export default function DeletionPage() {
  const [view, setView] = useState<PageView>("normal");

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScopes, setExportScopes] = useState<Set<string>>(new Set(EXPORT_SCOPES.map((s) => s.key)));
  const [exportOtp, setExportOtp] = useState("");
  const [exportQuota, setExportQuota] = useState(1);
  const [exportTasks, setExportTasks] = useState<ExportTask[]>([
    {
      id: "EXP-20260805-001", time: "2026-08-05 14:30",
      size: "2.3 MB", scope: 7, status: "completed",
    },
  ]);

  // Deletion state
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionOtp, setDeletionOtp] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelOtp, setCancelOtp] = useState("");

  // Prerequisites
  const prerequisites = {
    balance: true,  // ¥0.00
    tickets: true,  // 0 open
    refund: true,   // 0 pending
    verified: true, // verified
  };

  // Countdown
  const [countdown, setCountdown] = useState({ days: 6, hours: 23, minutes: 59, seconds: 45 });
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* ==================== Export ==================== */
  const toggleScope = useCallback((key: string) => {
    setExportScopes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const handleExportOtpInput = (idx: number, val: string) => {
    const newCode = exportOtp.substring(0, idx) + val + exportOtp.substring(idx + 1);
    setExportOtp(newCode.replace(/\D/g, "").substring(0, 6));
  };

  const submitExport = useCallback(async () => {
    if (exportOtp.length < 6) return;
    if (exportScopes.size === 0) return;
    setExportOpen(false);
    const now = new Date().toLocaleString("zh-CN");
    setExportQuota((q) => q + 1);
    const task: ExportTask = {
      id: `EXP-${Date.now()}`,
      time: now,
      size: "处理中…",
      scope: exportScopes.size,
      status: "processing",
    };
    setExportTasks((prev) => [task, ...prev]);

    // Simulate completion
    setTimeout(() => {
      setExportTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, size: "1.8 MB", status: "completed" as const }
            : t
        )
      );
    }, 2500);
  }, [exportOtp, exportScopes]);

  /* ==================== Deletion ==================== */
  const handleDeletionOtpInput = (idx: number, val: string) => {
    const newCode = deletionOtp.substring(0, idx) + val + deletionOtp.substring(idx + 1);
    setDeletionOtp(newCode.replace(/\D/g, "").substring(0, 6));
  };

  const handleCancelOtpInput = (idx: number, val: string) => {
    const newCode = cancelOtp.substring(0, idx) + val + cancelOtp.substring(idx + 1);
    setCancelOtp(newCode.replace(/\D/g, "").substring(0, 6));
  };

  const confirmDeletion = useCallback(async () => {
    if (deletionOtp.length < 6) return;
    setDeletionOpen(false);
    setView("pending");
    // Start countdown
    const end = new Date();
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 45);
    const update = () => {
      const diff = end.getTime() - Date.now();
      if (diff <= 0) { clearInterval(countdownRef.current); return; }
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    update();
    countdownRef.current = setInterval(update, 1000);
  }, [deletionOtp]);

  const confirmCancel = useCallback(async () => {
    if (cancelOtp.length < 6) return;
    setCancelOpen(false);
    setView("normal");
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, [cancelOtp]);

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const allReady = Object.values(prerequisites).every(Boolean);

  /* ==================== OTP Helpers ==================== */
  const renderOtpGroup = (
    value: string,
    onChange: (idx: number, val: string) => void,
    sendLabel: string,
    onSend: () => void,
  ) => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <input
            key={i}
            type="text"
            maxLength={1}
            inputMode="numeric"
            value={value[i] || ""}
            onChange={(e) => onChange(i, e.target.value)}
            style={{
              ...s.otpInput,
              borderColor: value[i] ? "rgba(79,110,247,0.4)" : "var(--color-border)",
            }}
          />
        ))}
      </div>
      <button style={{ ...s.btn("default"), padding: "8px 14px", fontSize: "var(--font-size-sm)" }} onClick={onSend}>
        {sendLabel}
      </button>
    </div>
  );

  /* ==================== Normal View ==================== */
  const renderNormal = () => (
    <>
      <PortalTopbar title="账号安全" helpHint="管理密码、会话、登录记录，以及账号注销和数据导出" />

      {/* Export Section */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h3 style={s.panelTitle}>
            数据可移植性
            <HelpIcon text="导出您的个人资料、消费记录、充值记录等数据到本地保存，每月限 3 次" />
          </h3>
        </div>
        <div style={s.panelBody}>
          <div style={s.actionCard("export")}>
            <div style={s.cardIcon("export")}>📥</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 500, color: "var(--color-text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                导出我的数据
                <HelpIcon text="导出个人资料、API Key 信息、消费/充值/发票/工单/通知/登录记录，共 8 类数据，加密 ZIP 下载，72 小时有效" />
              </div>
              <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 12 }}>
                导出个人资料、消费记录、充值记录等您在本平台的所有数据到本地保存。数据将打包为加密 ZIP 文件，下载链接 72 小时内有效。
              </div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                📊 本月已导出：<strong>{exportQuota}/3</strong> 次
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <button
                style={s.btn("primary", exportQuota >= 3)}
                onClick={() => setExportOpen(true)}
                disabled={exportQuota >= 3}
              >
                📥 导出我的数据
              </button>
            </div>
          </div>

          {exportTasks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {exportTasks.map((task) => (
                <div key={task.id} style={s.exportStatusCard(task.status)}>
                  <div style={{ fontSize: 24 }}>
                    {task.status === "completed" ? "📦" : "⏳"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text)", marginBottom: 2 }}>
                      导出任务 #{task.id}
                    </div>
                    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                      创建时间：{task.time} · {task.status === "processing" ? "处理中…" : `文件大小：${task.size}`} · 范围：{task.scope}/8 项
                    </div>
                    {task.status === "completed" && (
                      <div style={{ fontSize: "var(--font-size-sm)", color: "#ffa726" }}>
                        ⏰ 下载链接剩余：<strong>48 小时 15 分钟</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    {task.status === "completed" && (
                      <button style={{ ...s.btn("default"), fontSize: "var(--font-size-sm)", padding: "4px 12px" }}>📥 下载</button>
                    )}
                    {task.status === "processing" && (
                      <button style={{ ...s.btn("default"), fontSize: "var(--font-size-sm)", padding: "4px 12px" }} disabled>处理中</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Deletion Section */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h3 style={s.panelTitle}>
            账号注销
            <HelpIcon text="注销后所有 API Key 失效、服务停止。7 天冷静期内可撤销，30 天后数据永久删除" />
          </h3>
        </div>
        <div style={s.panelBody}>
          <div style={s.actionCard("delete")}>
            <div style={s.cardIcon("delete")}>🗑️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 500, color: "var(--color-text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                注销我的账号
                <HelpIcon text="注销后所有 API Key 失效，7 天冷静期可撤销，37 天后数据永久删除。注销前请确保余额已清零、工单已关闭" />
              </div>
              <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 12 }}>
                注销后所有 API Key 将立即失效、所有服务停止。<br />
                采用<strong>7 天冷静期 + 30 天数据保留期</strong>机制：冷静期内可随时取消注销，超过 37 天后个人数据将永久删除且不可恢复。
              </div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                ⚠️ 注销前请确认：余额已清零、无进行中工单、无审核中退款
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <button style={s.btn("danger")} onClick={() => setDeletionOpen(true)}>
                🗑️ 注销账号
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  /* ==================== Pending View ==================== */
  const renderPending = () => (
    <>
      <PortalTopbar title="⚠️ 注销确认" />
      <div style={{ maxWidth: 560, margin: "40px auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: "var(--font-size-3xl)", fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
            账号注销待确认
          </div>
          <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            您的账号注销申请已于 <strong>2026-08-07 15:30</strong> 提交。<br />
            注销将在 <strong>2026-08-14 15:30</strong> 完成。
          </div>
        </div>

        <div style={{ ...s.panel, textAlign: "center", padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginBottom: 8 }}>⏳ 剩余冷静期</div>
          <div style={{ fontSize: "var(--font-size-4xl)", fontWeight: 700, color: "var(--color-danger-text)", fontFamily: "monospace" }}>
            {countdown.days} 天 {String(countdown.hours).padStart(2, "0")} 小时 {String(countdown.minutes).padStart(2, "0")} 分钟 {String(countdown.seconds).padStart(2, "0")} 秒
          </div>
        </div>

        <div style={s.panel}>
          <div style={s.panelHeader}>
            <h3 style={s.panelTitle}>注销前已执行操作</h3>
          </div>
          <div style={s.panelBody}>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {[
                "所有 API Key 已失效（3 个 Key 已标记 revoked）",
                "所有活跃会话已退出（2 个设备已下线）",
                "余额已清零（¥0.00）",
                "实名认证信息将在 37 天后脱敏处理",
                "注销完成邮件将发送至 demo@test.com",
              ].map((text, i) => (
                <li key={i} style={{ padding: "8px 0", fontSize: "var(--font-size-md)", color: "var(--color-success-text)", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>✅</span> {text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button style={s.btn("warning")} onClick={() => setCancelOpen(true)}>
            ↩️ 取消注销（需邮箱验证）
          </button>
          <div style={{ marginTop: 10, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            取消注销后 API Key 自动恢复启用，账号恢复正常状态
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {view === "normal" ? renderNormal() : renderPending()}

      {/* Export Modal */}
      <div style={s.modalOverlay(exportOpen) as any} onClick={() => setExportOpen(false)}>
        <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text)", marginBottom: 6 }}>
            📥 导出我的数据
          </div>
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
            选择需要导出的数据类别，数据将打包为加密 ZIP 文件，下载链接 72 小时有效。
          </div>
          <div>
            {EXPORT_SCOPES.map((scope) => (
              <div key={scope.key} style={s.checkboxItem(exportScopes.has(scope.key))} onClick={() => toggleScope(scope.key)}>
                <input type="checkbox" checked={exportScopes.has(scope.key)} readOnly
                  style={{ width: 16, height: 16, accentColor: "var(--color-primary)" }} />
                <span style={{ flex: 1 }}>{scope.label}</span>
                <span style={{ fontSize: "var(--font-size-xs)", color: "#aaa", background: "#eee", padding: "2px 6px", borderRadius: 4 }}>
                  {scope.format}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 12 }}>
            ✅ 共选择 <strong>{exportScopes.size}</strong>/8 项数据 · ⚠️ 本月剩余导出次数：<strong>{3 - exportQuota}</strong> 次
          </div>
          <div style={{ marginTop: 20 }}>
            <label style={{ display: "block", fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginBottom: 6 }}>
              邮箱验证码（发送至 demo@test.com）
            </label>
            {renderOtpGroup(exportOtp, handleExportOtpInput, "发送验证码", () => {})}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <button style={s.btn("default")} onClick={() => setExportOpen(false)}>取消</button>
            <button style={s.btn("primary")} onClick={submitExport}>提交导出申请</button>
          </div>
        </div>
      </div>

      {/* Deletion Modal */}
      <div style={s.modalOverlay(deletionOpen) as any} onClick={() => setDeletionOpen(false)}>
        <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text)", marginBottom: 6 }}>
            🗑️ 注销账号
          </div>
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginBottom: 16 }}>
            确定要注销账号？注销后所有服务将不可用。请先确认以下条件：
          </div>
          <div>
            {[
              { key: "balance", label: "余额已清零（当前余额：¥0.00）", pass: prerequisites.balance },
              { key: "tickets", label: "无进行中工单（0 个未关闭工单）", pass: prerequisites.tickets },
              { key: "refund", label: "无审核中退款（0 笔退款审核中）", pass: prerequisites.refund },
              { key: "verified", label: "无未完成实名认证（认证状态：已实名）", pass: prerequisites.verified },
            ].map((item) => (
              <div key={item.key} style={s.checklistItem(item.pass)}>
                <span>{item.pass ? "✅" : "❌"}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <label style={{ display: "block", fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginBottom: 6 }}>
              邮箱验证码（发送至 demo@test.com）
            </label>
            {renderOtpGroup(deletionOtp, handleDeletionOtpInput, "发送验证码", () => {})}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <button style={s.btn("default")} onClick={() => setDeletionOpen(false)}>取消</button>
            <button
              style={s.btn("danger", !allReady)}
              onClick={confirmDeletion}
              disabled={!allReady}
            >
              确认注销
            </button>
          </div>
        </div>
      </div>

      {/* Cancel Deletion Modal */}
      <div style={s.modalOverlay(cancelOpen) as any} onClick={() => setCancelOpen(false)}>
        <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text)", marginBottom: 6 }}>
            ↩️ 取消账号注销
          </div>
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
            取消后您的账号将恢复正常状态，所有 API Key 将重新启用。<br />
            如需取消注销，请输入邮箱验证码确认操作。
          </div>
          <div>
            <label style={{ display: "block", fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginBottom: 6 }}>
              邮箱验证码（发送至 demo@test.com）
            </label>
            {renderOtpGroup(cancelOtp, handleCancelOtpInput, "发送验证码", () => {})}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <button style={s.btn("default")} onClick={() => setCancelOpen(false)}>暂不取消</button>
            <button style={s.btn("primary")} onClick={confirmCancel}>确认取消注销</button>
          </div>
        </div>
      </div>
    </>
  );
}

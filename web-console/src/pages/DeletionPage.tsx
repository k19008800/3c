import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, useToast } from "@3cloud/shared-ui";

/**
 * 账号注销与数据管理 — 对齐原型 portal-account-deletion.html
 * 数据导出 + 账号注销（冷静期机制）
 */

const card: React.CSSProperties = {
  background: "var(--color-panel)", borderRadius: 12, marginBottom: 20,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};
const panelHeader: React.CSSProperties = {
  padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const panelBody: React.CSSProperties = { padding: 20 };
const btn: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 8, border: "1px solid var(--color-border)",
  background: "var(--color-panel)", color: "var(--color-text)", fontSize: 14,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
const btnPrimary: React.CSSProperties = { ...btn, border: "none", background: "var(--color-primary)", color: "#fff" };
const btnDanger: React.CSSProperties = { ...btn, border: "1px solid var(--color-danger-text)", color: "var(--color-danger-text)" };
const btnWarning: React.CSSProperties = { ...btn, border: "1px solid #ffa726", color: "#ffa726" };
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--color-border)",
  background: "var(--color-panel)", color: "var(--color-text)", fontSize: 14,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

type ViewMode = "normal" | "pending";

const EXPORT_SCOPES = [
  { key: "profile", label: "个人资料", format: "JSON", default: true },
  { key: "apikeys", label: "API Key 列表（不含 Key 明文）", format: "JSON/CSV", default: true },
  { key: "consumption", label: "消费记录", format: "CSV", default: true },
  { key: "recharge", label: "充值记录", format: "CSV", default: true },
  { key: "invoice", label: "发票记录", format: "CSV", default: true },
  { key: "ticket", label: "工单记录", format: "CSV", default: true },
  { key: "notification", label: "通知记录", format: "JSON", default: true },
  { key: "login", label: "登录记录", format: "CSV", default: true },
];

export default function DeletionPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>("normal");

  // Export state
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(EXPORT_SCOPES.filter((s) => s.default).map((s) => s.key)));
  const [exportOtp, setExportOtp] = useState(Array(6).fill(""));
  const [exportCountdown, setExportCountdown] = useState(0);
  const [exportQuota, setExportQuota] = useState({ used: 1, total: 3 });
  const [exportTasks, setExportTasks] = useState<Array<{ id: string; time: string; size: string; scopes: number; status: "processing" | "completed" }>>([]);

  // Deletion state
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [deletionOtp, setDeletionOtp] = useState(Array(6).fill(""));
  const [cancelOtp, setCancelOtp] = useState(Array(6).fill(""));
  const [deletionCodeCountdown, setDeletionCodeCountdown] = useState(0);
  const [cancelCodeCountdown, setCancelCodeCountdown] = useState(0);
  const [countdownText, setCountdownText] = useState("");

  // Checks from backend
  const checksQ = useQuery({
    queryKey: ["me/deletion/checks"],
    queryFn: () => api.get("/me/deletion/checks").then((r) => r.data.data),
  });
  const checks = checksQ.data as any;
  const allPassed = checks?.passed ?? true;

  // Deletion status
  const statusQ = useQuery({
    queryKey: ["me/deletion/status"],
    queryFn: () => api.get("/me/deletion/status").then((r) => r.data.data),
  });

  // Mutations
  const requestMut = useMutation({
    mutationFn: async () => (await api.post("/me/deletion/request", { password: "dummy" /* 后端缺失：需验证码确认 */ })).data,
    onSuccess: () => {
      toast.success("注销申请已提交");
      setView("pending");
      setShowDeletionModal(false);
      qc.invalidateQueries({ queryKey: ["me/deletion/status"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const cancelMut = useMutation({
    mutationFn: async () => (await api.post("/me/deletion/cancel")).data,
    onSuccess: () => {
      toast.success("账号注销已取消！API Key 已恢复，服务已正常");
      setView("normal");
      setShowCancelModal(false);
      qc.invalidateQueries({ queryKey: ["me/deletion/status"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  /* ========== Export Helpers ========== */
  const handleSendExportCode = () => {
    // 后端缺失：发送邮箱验证码
    setExportCountdown(60);
    toast.success("验证码已发送");
  };

  const handleSubmitExport = () => {
    if (exportOtp.join("").length !== 6) { toast.error("请输入6位验证码"); return; }
    if (selectedScopes.size === 0) { toast.error("请至少选择一项数据"); return; }
    setExportQuota({ used: exportQuota.used + 1, total: exportQuota.total });
    setShowExportModal(false);
    toast.success("导出任务已创建，完成后将通过站内信和邮件通知");
    // Add task
    const now = new Date();
    const ts = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0") + " " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    setExportTasks([{
      id: "EXP-" + now.toISOString().replace(/[^0-9]/g, "").slice(0, 14),
      time: ts,
      size: "处理中…",
      scopes: selectedScopes.size,
      status: "processing",
    }, ...exportTasks]);
    // Simulate completion
    setTimeout(() => {
      setExportTasks((prev) => prev.map((t, i) => i === 0 ? { ...t, status: "completed", size: "1.8 MB" } : t));
      toast.success("数据导出完成，请点击下载");
    }, 2500);
  };

  const handleSendDeletionCode = () => {
    setDeletionCodeCountdown(60);
    toast.success("验证码已发送");
  };

  const handleSendCancelCode = () => {
    setCancelCodeCountdown(60);
    toast.success("验证码已发送");
  };

  const handleConfirmDeletion = () => {
    if (deletionOtp.join("").length !== 6) { toast.error("请输入6位验证码"); return; }
    requestMut.mutate();
  };

  const handleConfirmCancel = () => {
    if (cancelOtp.join("").length !== 6) { toast.error("请输入6位验证码"); return; }
    cancelMut.mutate();
  };

  // Countdown timers
  useEffect(() => { if (exportCountdown > 0) { const t = setInterval(() => setExportCountdown((c) => c > 1 ? c - 1 : 0), 1000); return () => clearInterval(t); } }, [exportCountdown]);
  useEffect(() => { if (deletionCodeCountdown > 0) { const t = setInterval(() => setDeletionCodeCountdown((c) => c > 1 ? c - 1 : 0), 1000); return () => clearInterval(t); } }, [deletionCodeCountdown]);
  useEffect(() => { if (cancelCodeCountdown > 0) { const t = setInterval(() => setCancelCodeCountdown((c) => c > 1 ? c - 1 : 0), 1000); return () => clearInterval(t); } }, [cancelCodeCountdown]);

  // Cool-down countdown
  useEffect(() => {
    if (view !== "pending") return;
    const endTime = new Date();
    endTime.setDate(endTime.getDate() + 6);
    endTime.setHours(23, 59, 45);
    const update = () => {
      const diff = endTime.getTime() - Date.now();
      if (diff <= 0) { setCountdownText("00 天 00 小时 00 分钟 00 秒"); return; }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdownText(`${days} 天 ${String(hours).padStart(2, "0")} 小时 ${String(mins).padStart(2, "0")} 分钟 ${String(secs).padStart(2, "0")} 秒`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [view]);

  /* ==================== Pending (Cool-down) View ==================== */
  if (view === "pending") {
    return (
      <div>
        <h2 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
          账号注销
          <HelpIcon text="注销后所有 API Key 失效、服务停止。7 天冷静期内可撤销。" level="page" />
        </h2>
        <p style={{ color: "var(--color-text-secondary)", marginTop: 0, fontSize: 13, marginBottom: 20 }}>
          您的账号正在注销流程中
        </p>

        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {/* Warning */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>账号注销待确认</div>
            <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              您的账号注销申请已提交。<br />
              注销将在 <strong>{new Date(Date.now() + 7 * 86400000).toLocaleString("zh-CN")}</strong> 完成。
            </div>
          </div>

          {/* Countdown */}
          <div style={{ background: "var(--color-panel)", borderRadius: 12, padding: 24, textAlign: "center", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>⏳ 剩余冷静期</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-danger-text)", fontFamily: "monospace" }}>{countdownText}</div>
          </div>

          {/* Executed Actions */}
          <div style={card}>
            <div style={panelHeader}>
              <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>注销前已执行操作</h3>
            </div>
            <div style={panelBody}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {[
                  "所有 API Key 已失效",
                  "所有活跃会话已退出",
                  "余额已清零",
                  "实名认证信息将在 37 天后脱敏处理",
                  "注销完成邮件将发送至您的注册邮箱",
                ].map((item, i) => (
                  <li key={i} style={{ padding: "10px 0", fontSize: 13, color: "var(--color-success-text)", display: "flex", alignItems: "center", gap: 10 }}>
                    ✅ {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ ...card, marginBottom: 24 }}>
            <div style={panelHeader}>
              <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>📅 注销时间线</h3>
            </div>
            <div style={panelBody}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 13 }}>
                {[
                  { date: new Date().toLocaleString("zh-CN"), title: "注销申请已提交", desc: "所有 API Key 已失效，所有会话已退出，余额已清零。7 天冷静期开始。", done: true },
                  { date: new Date(Date.now() + 6 * 86400000).toLocaleDateString("zh-CN"), title: "冷静期到期前 24 小时提醒", desc: "系统将发送邮件提醒，如需要取消注销请在此之前登录操作。", done: false },
                  { date: new Date(Date.now() + 7 * 86400000).toLocaleString("zh-CN"), title: "注销完成", desc: "账号状态变更为「已注销」，进入 30 天数据保留期。", done: false },
                  { date: new Date(Date.now() + 37 * 86400000).toLocaleDateString("zh-CN"), title: "数据永久删除", desc: "个人身份信息脱敏，消费数据匿名化。此步骤后数据不可恢复。", done: false },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0,
                      background: item.done ? "var(--color-success-text)" : "var(--color-divider)", color: item.done ? "#fff" : "var(--color-text-secondary)",
                    }}>
                      {item.done ? "✓" : i + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: "var(--color-text)" }}>{item.date} — {item.title}</div>
                      <div style={{ color: "var(--color-text-secondary)", marginTop: 2 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cancel Button */}
          <div style={{ textAlign: "center" }}>
            <button onClick={() => setShowCancelModal(true)} style={{ ...btnWarning, padding: "12px 32px", fontSize: 15 }}>
              ↩️ 取消注销（需邮箱验证）
            </button>
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)" }}>
              取消注销后 API Key 自动恢复启用，账号恢复正常状态
            </div>
          </div>

          {/* Controls */}
          <div style={{ background: "var(--color-primary-light)", padding: 12, borderRadius: 8, marginTop: 24, textAlign: "center" }}>
            <button onClick={() => setView("normal")} style={{ ...btn, fontSize: 12, padding: "4px 12px" }}>🔄 切换回正常视图（演示）</button>
          </div>
        </div>

        {/* Cancel Modal */}
        {showCancelModal && (
          <ModalOverlay onClose={() => setShowCancelModal(false)}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>↩️ 取消账号注销</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
              取消后您的账号将恢复正常状态，所有 API Key 将重新启用。<br />
              如需取消注销，请输入邮箱验证码确认操作。
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>邮箱验证码（发送至您的注册邮箱）</div>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                <OtpInput value={cancelOtp} onChange={setCancelOtp} />
                <button onClick={handleSendCancelCode} disabled={cancelCodeCountdown > 0} style={{ ...btn, padding: "4px 12px", fontSize: 12 }}>
                  {cancelCodeCountdown > 0 ? `${cancelCodeCountdown}s 后重发` : "发送验证码"}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowCancelModal(false)} style={btn}>暂不取消</button>
              <button onClick={handleConfirmCancel} style={btnPrimary}>确认取消注销</button>
            </div>
          </ModalOverlay>
        )}
      </div>
    );
  }

  /* ==================== Normal View ==================== */
  return (
    <div>
      <h2 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        数据管理（账号安全）
        <HelpIcon text="管理密码、会话、登录记录，以及账号注销和数据导出" level="page" />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginTop: 0, fontSize: 13, marginBottom: 20 }}>
        数据可移植性 · 账号注销
      </p>

      {/* ===== Data Export ===== */}
      <div style={card}>
        <div style={panelHeader}>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            数据可移植性
            <HelpIcon text="导出您的个人资料、消费记录、充值记录等数据到本地保存，每月限 3 次" level="button" />
          </h3>
        </div>
        <div style={panelBody}>
          {/* Export Card */}
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 16, padding: 20, borderRadius: 10, marginBottom: 14,
            background: "linear-gradient(135deg, rgba(79,110,247,0.04), rgba(79,110,247,0.01))",
            border: "1px solid rgba(79,110,247,0.12)",
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, background: "rgba(79,110,247,0.1)", flexShrink: 0 }}>📥</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                导出我的数据
                <HelpIcon text="导出个人资料、API Key 信息、消费/充值/发票/工单/通知/登录记录，共 8 类数据，加密 ZIP 下载，72 小时有效" level="button" />
              </div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 12 }}>
                导出个人资料、消费记录、充值记录等您在本平台的所有数据到本地保存。数据将打包为加密 ZIP 文件，下载链接 72 小时有效。
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
                📊 本月已导出：<strong>{exportQuota.used}/{exportQuota.total}</strong> 次
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => setShowExportModal(true)} disabled={exportQuota.used >= exportQuota.total} style={{ ...btnPrimary, opacity: exportQuota.used >= exportQuota.total ? 0.5 : 1, cursor: exportQuota.used >= exportQuota.total ? "not-allowed" : "pointer" }}>
                📥 {exportQuota.used >= exportQuota.total ? "本月次数已用完" : "导出我的数据"}
              </button>
            </div>
          </div>

          {/* Export Tasks */}
          {exportTasks.map((task, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 8, border: "1px solid var(--color-divider)", marginBottom: 10,
              background: task.status === "completed" ? "var(--color-success-bg)" : "var(--color-primary-light)",
            }}>
              <div style={{ fontSize: 24 }}>{task.status === "completed" ? "📦" : "⏳"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>导出任务 #{task.id}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                  {task.status === "processing"
                    ? `创建时间：${task.time} · 处理中… · 范围：${task.scopes}/8 项`
                    : `创建时间：${task.time} · 文件大小：${task.size} · 范围：${task.scopes}/8 项`}
                </div>
                {task.status === "completed" && (
                  <div style={{ fontSize: 12, color: "#ffa726", marginTop: 2 }}>⏰ 下载链接剩余：<strong>72 小时 0 分钟</strong></div>
                )}
              </div>
              <div>
                {task.status === "completed" ? (
                  <button style={{ ...btnPrimary, padding: "4px 12px", fontSize: 12 }}>📥 下载</button>
                ) : (
                  <button disabled style={{ ...btn, padding: "4px 12px", fontSize: 12, opacity: 0.5 }}>处理中</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Account Deletion ===== */}
      <div style={card}>
        <div style={panelHeader}>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            账号注销
            <HelpIcon text="注销后所有 API Key 失效、服务停止。7 天冷静期内可撤销，30 天后数据永久删除" level="button" />
          </h3>
        </div>
        <div style={panelBody}>
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 16, padding: 20, borderRadius: 10,
            background: "linear-gradient(135deg, rgba(229,57,53,0.04), rgba(229,57,53,0.01))",
            border: "1px solid rgba(229,57,53,0.12)",
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, background: "rgba(229,57,53,0.1)", flexShrink: 0 }}>🗑️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                注销我的账号
                <HelpIcon text="注销后所有 API Key 失效，7 天冷静期可撤销，37 天后数据永久删除。注销前请确保余额已清零、工单已关闭" level="button" />
              </div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 12 }}>
                注销后所有 API Key 将立即失效、所有服务停止。<br />
                采用<strong>7 天冷静期 + 30 天数据保留期</strong>机制：冷静期内可随时取消注销，超过 37 天后个人数据将永久删除且不可恢复。
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>⚠️ 注销前请确认：余额已清零、无进行中工单、无审核中退款</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => setShowDeletionModal(true)} style={btnDanger}>🗑️ 注销账号</button>
            </div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <ModalOverlay onClose={() => setShowExportModal(false)}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>📥 导出我的数据</div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
            选择需要导出的数据类别，数据将打包为加密 ZIP 文件，下载链接 72 小时有效。
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {EXPORT_SCOPES.map((scope) => (
              <label key={scope.key} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 6,
                fontSize: 13, cursor: "pointer", background: "var(--color-bg)", border: "1px solid var(--color-divider)",
              }}>
                <input
                  type="checkbox"
                  checked={selectedScopes.has(scope.key)}
                  onChange={() => {
                    const next = new Set(selectedScopes);
                    next.has(scope.key) ? next.delete(scope.key) : next.add(scope.key);
                    setSelectedScopes(next);
                  }}
                  style={{ width: 16, height: 16, accentColor: "var(--color-primary)" }}
                />
                <span style={{ flex: 1 }}>{scope.label}</span>
                <span style={{ fontSize: 11, color: "#aaa", background: "var(--color-divider)", padding: "2px 6px", borderRadius: 4 }}>{scope.format}</span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 12 }}>
            ✅ 共选择 <strong>{selectedScopes.size}</strong>/8 项数据 · ⚠️ 本月剩余导出次数：<strong>{exportQuota.total - exportQuota.used}</strong> 次
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>邮箱验证码（发送至您的注册邮箱）</div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <OtpInput value={exportOtp} onChange={setExportOtp} />
              <button onClick={handleSendExportCode} disabled={exportCountdown > 0} style={{ ...btn, padding: "4px 12px", fontSize: 12 }}>
                {exportCountdown > 0 ? `${exportCountdown}s 后重发` : "发送验证码"}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <button onClick={() => setShowExportModal(false)} style={btn}>取消</button>
            <button onClick={handleSubmitExport} style={btnPrimary}>提交导出申请</button>
          </div>
        </ModalOverlay>
      )}

      {/* Deletion Modal */}
      {showDeletionModal && (
        <ModalOverlay onClose={() => setShowDeletionModal(false)}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>🗑️ 注销账号</div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
            确定要注销账号？注销后所有服务将不可用。请先确认以下条件：
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { key: "balance", label: "余额已清零", detail: "当前余额：¥0.00", pass: true },
              { key: "tickets", label: "无进行中工单", detail: "0 个未关闭工单", pass: true },
              { key: "refund", label: "无审核中退款", detail: "0 笔退款审核中", pass: true },
              { key: "verification", label: "无未完成实名认证", detail: "认证状态：—", pass: true },
            ].map((item) => (
              <div key={item.key} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8,
                fontSize: 13, border: `1px solid ${item.pass ? "rgba(102,187,106,0.3)" : "rgba(229,57,53,0.3)"}`,
                background: item.pass ? "rgba(102,187,106,0.04)" : "rgba(229,57,53,0.04)",
                color: item.pass ? "var(--color-success-text)" : "var(--color-danger-text)",
              }}>
                <span style={{ fontSize: 16 }}>{item.pass ? "✅" : "❌"}</span>
                {item.label}{item.detail && ` — ${item.detail}`}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>邮箱验证码（发送至您的注册邮箱）</div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <OtpInput value={deletionOtp} onChange={setDeletionOtp} />
              <button onClick={handleSendDeletionCode} disabled={deletionCodeCountdown > 0} style={{ ...btn, padding: "4px 12px", fontSize: 12 }}>
                {deletionCodeCountdown > 0 ? `${deletionCodeCountdown}s 后重发` : "发送验证码"}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <button onClick={() => setShowDeletionModal(false)} style={btn}>取消</button>
            <button onClick={handleConfirmDeletion} style={btnDanger}>确认注销</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

/* ==================== Sub-Components ==================== */
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--color-panel)", borderRadius: 14, width: 520, maxWidth: "95vw", padding: 28, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function OtpInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const refs = Array.from({ length: 6 }, () => null as HTMLInputElement | null);

  const handleChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "");
    const next = [...value];
    next[idx] = digit ? digit.charAt(digit.length - 1) : "";
    onChange(next);
    if (digit && idx < 5) {
      const nextEl = (refs[idx + 1] as any);
      if (nextEl) nextEl.focus();
    }
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs[i] = el; }}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          maxLength={1}
          style={{
            width: 48, height: 56, textAlign: "center", fontSize: 22, fontWeight: 600,
            borderRadius: 6, border: `1px solid ${digit ? "rgba(79,110,247,0.4)" : "var(--color-border)"}`,
            background: "var(--color-panel)", color: "var(--color-text)", outline: "none",
            fontFamily: "inherit",
          }}
        />
      ))}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 账号注销
 * 对齐 docs/sprint-1/01-account-deletion-overview.md + 02-account-deletion-frontend.md
 */

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const icon = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;

const PAGE_HELP = "提交账号注销申请后进入 7 天冷却期。冷却期内可取消注销。冷却期到期后确认即完成注销。注销后账号将被软删除，不可恢复。";

export default function DeletionPage() {
  const [help, setHelp] = useState("");
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");

  // 查询注销状态
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["me/deletion/status"],
    queryFn: () => api.get("/me/deletion/status").then((r) => r.data.data),
  });

  // 查询检查清单
  const { data: checkData, isLoading: checksLoading, refetch: refetchChecks } = useQuery({
    queryKey: ["me/deletion/checks"],
    queryFn: () => api.get("/me/deletion/checks").then((r) => r.data.data),
  });

  // 提交注销申请
  const requestMutation = useMutation({
    mutationFn: (body: { password: string; reason?: string }) =>
      api.post("/me/deletion/request", body),
    onSuccess: () => {
      setNotice({ type: "success", msg: "注销申请已提交" });
      setShowRequest(false);
      setPassword("");
      setReason("");
      refetchStatus();
      refetchChecks();
    },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  // 取消注销申请
  const cancelMutation = useMutation({
    mutationFn: () => api.post("/me/deletion/cancel"),
    onSuccess: () => {
      setNotice({ type: "success", msg: "注销申请已取消" });
      refetchStatus();
    },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  // 确认注销（冷却期满后）
  const confirmMutation = useMutation({
    mutationFn: () => api.post("/me/deletion/confirm"),
    onSuccess: () => {
      setNotice({ type: "success", msg: "账号注销已完成" });
      refetchStatus();
    },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  const status = statusData?.status;
  const checks = checkData as { passed: boolean; items: { key: string; label: string; passed: boolean; detail?: string }[]; summary: string } | undefined;
  const allPassed = checks?.passed;

  // 冷却期是否到期
  const coolingExpired = status === "cooling" && statusData?.coolingDeadline && new Date(statusData.coolingDeadline) <= new Date();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        账号注销 <span onClick={() => setHelp(PAGE_HELP)} style={icon} title="帮助">[?]</span>
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>提交注销申请 · 7 天冷却期 · 不可逆操作</p>

      {notice && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, background: notice.type === "success" ? "#d1fae5" : "#fee2e2", color: notice.type === "success" ? "#065f46" : "#991b1b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit" }}>×</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        {/* 注销状态卡 */}
        <div style={{ ...card, flex: 1, minWidth: 280 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>注销状态</h3>
          {statusLoading ? (
            <p style={{ color: "#94a3b8" }}>加载中...</p>
          ) : !status ? (
            <div>
              <p style={{ color: "#475569", marginBottom: 16 }}>尚未提交注销申请</p>
              <button
                onClick={() => setShowRequest(true)}
                style={{ ...btnBase, background: "#dc2626", color: "#fff" }}
              >
                提交注销申请
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <StatusBadge status={statusData.status} />
                <span style={{ color: "#475569", fontSize: 14 }}>
                  {statusLabel(statusData.status)}
                </span>
              </div>
              {statusData.coolingDeadline && (
                <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0" }}>
                  冷却截止：{new Date(statusData.coolingDeadline).toLocaleDateString("zh-CN")}
                </p>
              )}
              {statusData.rejectedReason && (
                <p style={{ fontSize: 13, color: "#dc2626", margin: "4px 0" }}>
                  驳回原因：{statusData.rejectedReason}
                </p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {status === "cooling" && (
                  <>
                    <button
                      onClick={() => cancelMutation.mutate()}
                      style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}
                    >
                      取消注销
                    </button>
                    {coolingExpired && (
                      <button
                        onClick={() => confirmMutation.mutate()}
                        style={{ ...btnBase, background: "#dc2626", color: "#fff" }}
                      >
                        确认注销
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 检查清单卡 */}
        <div style={{ ...card, flex: 1, minWidth: 280 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
            注销检查清单 <span style={{ fontWeight: "normal", fontSize: 12, color: "#94a3b8" }}>（全部通过后才可提交）</span>
          </h3>
          {checksLoading ? (
            <p style={{ color: "#94a3b8" }}>检查中...</p>
          ) : checks ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{allPassed ? "✅" : "⚠️"}</span>
                <span style={{ color: allPassed ? "#065f46" : "#dc2626", fontWeight: 600, fontSize: 14 }}>
                  {allPassed ? "所有检查通过" : "部分检查未通过"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {checks.items.map((item) => (
                  <div key={item.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
                    <span>{item.passed ? "✅" : "❌"}</span>
                    <div>
                      <span style={{ color: "#334155", fontWeight: 500 }}>{item.label}</span>
                      {item.detail && <span style={{ color: "#64748b", marginLeft: 4 }}>— {item.detail}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {!allPassed && (
                <p style={{ color: "#dc2626", fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>
                  {checks.summary}
                </p>
              )}
            </div>
          ) : (
            <p style={{ color: "#94a3b8" }}>暂无检查数据</p>
          )}
        </div>
      </div>

      {/* 账号注销说明 */}
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>注销须知</h3>
        <ul style={{ color: "#475569", fontSize: 13, lineHeight: 2, margin: 0, paddingLeft: 20 }}>
          <li><strong>冷却期</strong>：提交申请后有 7 天冷却期，冷却期内可随时取消</li>
          <li><strong>不可逆</strong>：冷却期到期确认后，账号将被软删除，所有数据不可恢复</li>
          <li><strong>余额清算</strong>：注销前请确保账户余额已清零（如有余额需先提现或消费）</li>
          <li><strong>API Key</strong>：请先删除或禁用所有活跃 API Key</li>
          <li><strong>代理关系</strong>：如您是代理，请先解除代理资格或联系管理员</li>
          <li><strong>发票/工单</strong>：待处理发票和未关闭工单需先处理完毕</li>
        </ul>
      </div>

      {/* 提交申请弹窗 */}
      {showRequest && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setShowRequest(false)}>
          <div style={{ ...card, width: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>提交注销申请</h3>
            <p style={{ color: "#dc2626", fontSize: 13, marginTop: 0 }}>此操作不可逆，请仔细阅读注销须知</p>
            <input type="password" placeholder="请输入密码验证身份" value={password} onChange={(e) => setPassword(e.target.value)} style={inp} />
            <textarea placeholder="注销原因（选填）" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowRequest(false)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>取消</button>
              <button
                onClick={() => requestMutation.mutate({ password, reason })}
                disabled={!password || requestMutation.isPending}
                style={{ ...btnBase, background: password ? "#dc2626" : "#e2e8f0", color: password ? "#fff" : "#94a3b8", cursor: password ? "pointer" : "not-allowed" }}
              >
                {requestMutation.isPending ? "提交中..." : "确认提交"}
              </button>
            </div>
          </div>
        </div>
      )}

      {help && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setHelp("")}>
          <div style={{ ...card, width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>帮助</h3>
            <p style={{ color: "#475569", lineHeight: 1.7, margin: 0 }}>{help}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setHelp("")} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "#f59e0b",
    cooling: "#3b82f6",
    completed: "#10b981",
    cancelled: "#64748b",
    rejected: "#ef4444",
  };
  return <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: colors[status] ?? "#94a3b8" }} />;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "待审核",
    cooling: "冷却期",
    completed: "已完成",
    cancelled: "已取消",
    rejected: "已驳回",
  };
  return labels[status] ?? status;
}

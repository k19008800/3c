import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface AgentRow {
  id: number; user_id: number; level: string; level_label: string; commission_rate: number;
  verify_status: string; referral_code: string; withdraw_account: string | null;
  email: string; username: string | null; real_name_status: string; balance: number;
  customer_count: number; created_at: string;
}
interface ReportRow {
  id: number; agent_user_id: number; target_phone: string | null; target_email: string | null;
  target_user_id: number | null; note: string | null; status: string;
  reject_reason: string | null; audit_at: string | null; created_at: string;
  agent_email: string; agent_username: string; target_email_user: string | null;
  target_username: string | null; current_agent: number | null;
}
interface CustomerRow {
  id: number; agent_user_id: number; customer_user_id: number; bound_at: string;
  agent_email: string; agent_username: string; customer_email: string;
  customer_username: string; customer_phone: string | null;
}

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

const LEVEL_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  prepare: "default",
  level1: "info",
  senior: "warning",
};
const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning",
  passed: "success",
  rejected: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待审核",
  passed: "已通过",
  rejected: "已驳回",
};

const TABS = [
  { key: "agents", label: "代理列表" },
  { key: "assign", label: "设为代理商" },
  { key: "reports", label: "报备审核" },
  { key: "customers", label: "客户归属" },
];

export default function AdminAgentsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("agents");
  const [levelFilter, setLevelFilter] = useState("");
  const { toast } = useToast();
  const [assignForm, setAssignForm] = useState({ userId: "", level: "level1" });
  const [reportStatus, setReportStatus] = useState("pending");

  /* ===== 代理列表 ===== */
  const listQ = useQuery({
    queryKey: ["admin-agents", levelFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "100" });
      if (levelFilter) params.set("level", levelFilter);
      return (await api.get<{ data: { list: AgentRow[]; pagination: { total: number } } }>(`/admin/agents?${params}`)).data.data;
    },
  });

  const levelMut = useMutation({
    mutationFn: async ({ uid, level }: { uid: number; level: string }) => (await api.put(`/admin/agents/${uid}/level`, { level })).data,
    onSuccess: () => { toast.success("等级已调整"); qc.invalidateQueries({ queryKey: ["admin-agents"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ===== 设为代理商 ===== */
  const assignMut = useMutation({
    mutationFn: async () => (await api.post("/admin/agents/assign", { userId: Number(assignForm.userId), level: assignForm.level })).data,
    onSuccess: (d: any) => { toast.success(d.data?.created ? "已设为代理商" : "已更新代理商档案"); setAssignForm({ userId: "", level: "level1" }); qc.invalidateQueries({ queryKey: ["admin-agents"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ===== 报备审核 ===== */
  const reportsQ = useQuery({
    queryKey: ["admin-agent-reports", reportStatus],
    queryFn: async () => (await api.get<{ data: { list: ReportRow[] } }>(`/admin/agent-reports?status=${reportStatus}`)).data.data,
    enabled: tab === "reports",
  });

  const auditMut = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "pass" | "reject" }) => (await api.post(`/admin/agent-reports/${id}/audit`, { action })).data,
    onSuccess: (d: any) => { toast.success(d.data?.status === "passed" ? "已通过并自动划拨" : "已驳回"); qc.invalidateQueries({ queryKey: ["admin-agent-reports"] }); qc.invalidateQueries({ queryKey: ["admin-agent-customers"] }); qc.invalidateQueries({ queryKey: ["admin-agents"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ===== 客户归属 ===== */
  const customersQ = useQuery({
    queryKey: ["admin-agent-customers"],
    queryFn: async () => (await api.get<{ data: { list: CustomerRow[]; pagination: { total: number } } }>("/admin/agent-customers?page_size=100")).data.data,
    enabled: tab === "customers",
  });

  const unbindMut = useMutation({
    mutationFn: async ({ cid }: { cid: number }) => (await api.post(`/admin/agent-customers/${cid}/unbind`, {})).data,
    onSuccess: () => { toast.success("已解除归属"); qc.invalidateQueries({ queryKey: ["admin-agent-customers"] }); qc.invalidateQueries({ queryKey: ["admin-agents"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  const agents = listQ.data?.list ?? [];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        代理管理
        <HelpIcon text="代理商由平台后台授权创建（无用户自助入口），客户归属通过报备划拨建立，全程留审计。后台主导 · 报备划拨 · 单级分销。" level="page" />
      </h2>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 20 }}>后台主导 · 报备划拨 · 单级分销 · 无用户自助入口</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "2px solid var(--color-border)", paddingBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ ...btnBase, background: tab === t.key ? "var(--color-primary)" : "var(--color-bg)", color: tab === t.key ? "#fff" : "var(--color-text-secondary)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ Tab: 代理列表 ============ */}
      {tab === "agents" && (
        <>
          <div style={{ ...card, marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ padding: "8px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
              <option value="">全部等级</option>
              <option value="prepare">预备代理</option>
              <option value="level1">一级代理</option>
              <option value="senior">高级代理</option>
            </select>
            <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>共 {listQ.data?.pagination?.total ?? 0} 个代理</span>
          </div>
          <div style={card}>
            {listQ.isLoading ? (
              <SkeletonGroup lines={5} />
            ) : agents.length === 0 ? (
              <EmptyState title="暂无代理" />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>代理</th><th style={{ padding: "8px" }}>等级</th><th style={{ padding: "8px" }}>佣金率</th>
                    <th style={{ padding: "8px" }}>归属客户</th><th style={{ padding: "8px" }}>余额</th><th style={{ padding: "8px" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.user_id} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "8px" }}>
                        <div style={{ fontWeight: 600 }}>{a.username ?? a.email}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{a.email}</div>
                      </td>
                      <td style={{ padding: "8px" }}>
                        <StatusBadge status={LEVEL_MAP[a.level] ?? "default"}>{a.level_label}</StatusBadge>
                      </td>
                      <td style={{ padding: "8px" }}>{(a.commission_rate * 100).toFixed(0)}%</td>
                      <td style={{ padding: "8px" }}>{a.customer_count}</td>
                      <td style={{ padding: "8px" }}>¥{(a.balance / 100).toFixed(2)}</td>
                      <td style={{ padding: "8px" }}>
                        <select defaultValue={a.level} onChange={(e) => levelMut.mutate({ uid: a.user_id, level: e.target.value })} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 12 }}>
                          <option value="prepare">预备</option>
                          <option value="level1">一级</option>
                          <option value="senior">高级</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ============ Tab: 设为代理商 ============ */}
      {tab === "assign" && (
        <div style={card}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            设为代理商
            <HelpIcon text="在用户列表中选中目标用户，后台直接赋予其代理商身份。用户端无申请入口，身份由平台授权。个人/企业用户均可。" />
          </h3>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>个人/企业用户均可；被设为代理后保留其普通功能，但无裂变/自助绑定能力。</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
            <div>
              <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>目标用户 ID *</label>
              <input value={assignForm.userId} onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })} placeholder="用户 ID（数字）" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>代理等级</label>
              <select value={assignForm.level} onChange={(e) => setAssignForm({ ...assignForm, level: e.target.value })} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box" }}>
                <option value="prepare">预备代理（0%）</option>
                <option value="level1">一级代理（10%）</option>
                <option value="senior">高级代理（15%）</option>
              </select>
            </div>
            <button onClick={() => assignMut.mutate()} disabled={assignMut.isPending || !assignForm.userId.trim()} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", padding: "10px 18px", opacity: assignMut.isPending || !assignForm.userId.trim() ? 0.6 : 1 }}>
              {assignMut.isPending ? "提交中..." : "设为代理商"}
            </button>
          </div>
        </div>
      )}

      {/* ============ Tab: 报备审核 ============ */}
      {tab === "reports" && (
        <div style={card}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
              报备审核
              <HelpIcon text="代理商报备目标客户，后台审核。点击通过即自动划拨到该代理商名下（归属唯一，变更留审计）。" />
            </h3>
            <select value={reportStatus} onChange={(e) => setReportStatus(e.target.value)} style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13 }}>
              <option value="pending">待审核</option>
              <option value="passed">已通过</option>
              <option value="rejected">已驳回</option>
              <option value="all">全部</option>
            </select>
          </div>
          {reportsQ.isLoading ? (
            <SkeletonGroup lines={4} />
          ) : (reportsQ.data?.list?.length ?? 0) === 0 ? (
            <EmptyState title="暂无报备" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                  <th style={{ padding: "8px" }}>代理商</th><th style={{ padding: "8px" }}>目标客户</th><th style={{ padding: "8px" }}>备注</th>
                  <th style={{ padding: "8px" }}>当前归属</th><th style={{ padding: "8px" }}>提交时间</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {(reportsQ.data?.list ?? []).map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px" }}>
                      <div style={{ fontWeight: 600 }}>{r.agent_username ?? r.agent_email}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{r.agent_email}</div>
                    </td>
                    <td style={{ padding: "8px" }}>
                      <div>{r.target_username ?? r.target_email_user ?? r.target_email ?? r.target_phone ?? `#${r.target_user_id}`}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{r.target_email || r.target_phone || `ID:${r.target_user_id}`}</div>
                    </td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{r.note ?? "-"}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{r.current_agent ? `已归属 #${r.current_agent}` : "无归属"}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 12 }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>
                      <StatusBadge status={STATUS_MAP[r.status] ?? "default"}>{STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                      {r.reject_reason && <div style={{ fontSize: 11, color: "var(--color-danger-text)", marginTop: 2 }}>{r.reject_reason}</div>}
                    </td>
                    <td style={{ padding: "8px" }}>
                      {r.status === "pending" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => auditMut.mutate({ id: r.id, action: "pass" })} disabled={auditMut.isPending} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff" }}>通过并划拨</button>
                          <button onClick={() => auditMut.mutate({ id: r.id, action: "reject" })} disabled={auditMut.isPending} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)" }}>驳回</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ============ Tab: 客户归属 ============ */}
      {tab === "customers" && (
        <div style={card}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            客户归属
            <HelpIcon text="各代理商的归属客户列表。一个客户同一时刻只归属一个代理商，归属来源为后台报备划拨。变更全程留审计日志。" />
          </h3>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>归属变更（转移/解绑）全程留审计日志。</div>
          {customersQ.isLoading ? (
            <SkeletonGroup lines={4} />
          ) : (customersQ.data?.list?.length ?? 0) === 0 ? (
            <EmptyState title="暂无归属客户" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                  <th style={{ padding: "8px" }}>客户</th><th style={{ padding: "8px" }}>归属代理商</th><th style={{ padding: "8px" }}>划拨时间</th><th style={{ padding: "8px" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {(customersQ.data?.list ?? []).map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px" }}>
                      <div style={{ fontWeight: 600 }}>{c.customer_username ?? c.customer_email}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{c.customer_email || c.customer_phone}</div>
                    </td>
                    <td style={{ padding: "8px" }}>
                      <div>{c.agent_username ?? c.agent_email}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{c.agent_email}</div>
                    </td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 12 }}>{new Date(c.bound_at).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>
                      <button onClick={() => unbindMut.mutate({ cid: c.customer_user_id })} disabled={unbindMut.isPending} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)" }}>
                        解除归属
                      </button>
                    </td>
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

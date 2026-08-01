import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/* ============ 类型 ============ */
interface AgentRow {
  id: number;
  user_id: number;
  level: string;
  level_label: string;
  commission_rate: number;
  verify_status: string;
  referral_code: string;
  withdraw_account: string | null;
  parent_user_id: number | null;
  email: string;
  username: string | null;
  real_name_status: string;
  balance: number;
  customer_count: number;
  created_at: string;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const LEVEL_BADGE: Record<string, { bg: string; color: string }> = {
  prepare: { bg: "#f1f5f9", color: "#475569" },
  level1: { bg: "#dbeafe", color: "#1e40af" },
  senior: { bg: "#fef3c7", color: "#92400e" },
};
const VERIFY_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  unverified: { bg: "#f1f5f9", color: "#64748b", label: "未认证" },
  pending: { bg: "#fef9c3", color: "#854d0e", label: "待审核" },
  verified: { bg: "#dcfce7", color: "#166534", label: "已认证" },
  rejected: { bg: "#fee2e2", color: "#991b1b", label: "已驳回" },
};

export default function AdminAgentsPage() {
  const qc = useQueryClient();
  const [levelFilter, setLevelFilter] = useState("");
  const [verifyFilter, setVerifyFilter] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-agents", levelFilter, verifyFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "100" });
      if (levelFilter) params.set("level", levelFilter);
      if (verifyFilter) params.set("verify_status", verifyFilter);
      return (await api.get<{ data: { list: AgentRow[]; pagination: { total: number } } }>(`/admin/agents?${params}`)).data.data;
    },
  });

  const pendingQ = useQuery({
    queryKey: ["admin-agents-pending"],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>("/admin/agents/pending")).data.data.list,
  });

  const auditMut = useMutation({
    mutationFn: async ({ uid, action }: { uid: number; action: "approve" | "reject" }) =>
      (await api.post(`/admin/agents/${uid}/audit`, { action })).data,
    onSuccess: () => {
      setNotice({ type: "success", msg: "审核操作成功" });
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
      qc.invalidateQueries({ queryKey: ["admin-agents-pending"] });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const levelMut = useMutation({
    mutationFn: async ({ uid, level }: { uid: number; level: string }) =>
      (await api.put(`/admin/agents/${uid}/level`, { level })).data,
    onSuccess: () => {
      setNotice({ type: "success", msg: "等级已调整" });
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const agents = listQ.data?.list ?? [];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>代理管理</h2>

      {/* 待审核队列 */}
      {pendingQ.data && pendingQ.data.length > 0 && (
        <div style={{ ...card, marginBottom: 24, borderLeft: "4px solid #f59e0b" }}>
          <h3 style={{ marginBottom: 12 }}>待审核升级申请（{pendingQ.data.length}）</h3>
          {pendingQ.data.map((p) => (
            <div key={p.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #f1f5f9" }}>
              <div>
                <span style={{ fontWeight: 600 }}>{p.email}</span>
                <span style={{ color: "#94a3b8", marginLeft: 12, fontSize: 13 }}>{p.username ?? "—"}</span>
                <span style={{ marginLeft: 12, fontSize: 12 }}>邀请码: <strong style={{ fontFamily: "monospace" }}>{p.referral_code}</strong></span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => auditMut.mutate({ uid: p.user_id, action: "approve" })} disabled={auditMut.isPending} style={{ ...btnBase, background: "#16a34a", color: "#fff" }}>
                  通过
                </button>
                <button onClick={() => auditMut.mutate({ uid: p.user_id, action: "reject" })} disabled={auditMut.isPending} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b" }}>
                  驳回
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 筛选 */}
      <div style={{ ...card, marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ padding: "8px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
          <option value="">全部等级</option>
          <option value="prepare">预备代理</option>
          <option value="level1">一级代理</option>
          <option value="senior">高级代理</option>
        </select>
        <select value={verifyFilter} onChange={(e) => setVerifyFilter(e.target.value)} style={{ padding: "8px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
          <option value="">全部实名状态</option>
          <option value="unverified">未认证</option>
          <option value="pending">待审核</option>
          <option value="verified">已认证</option>
          <option value="rejected">已驳回</option>
        </select>
        <span style={{ color: "#94a3b8", fontSize: 13 }}>共 {listQ.data?.pagination?.total ?? 0} 个代理</span>
      </div>

      {/* 代理列表 */}
      <div style={card}>
        {listQ.isLoading ? (
          <div style={{ color: "#94a3b8" }}>加载中...</div>
        ) : agents.length === 0 ? (
          <div style={{ color: "#94a3b8", padding: 30, textAlign: "center" }}>暂无代理</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>代理</th>
                <th style={{ padding: "8px" }}>等级</th>
                <th style={{ padding: "8px" }}>实名</th>
                <th style={{ padding: "8px" }}>佣金率</th>
                <th style={{ padding: "8px" }}>客户</th>
                <th style={{ padding: "8px" }}>余额</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.user_id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px" }}>
                    <div style={{ fontWeight: 600 }}>{a.username ?? a.email}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{a.email}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{a.referral_code}</div>
                  </td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ ...(LEVEL_BADGE[a.level] ?? LEVEL_BADGE.prepare), padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>
                      {a.level_label}
                    </span>
                  </td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ background: VERIFY_BADGE[a.verify_status]?.bg ?? "#f1f5f9", color: VERIFY_BADGE[a.verify_status]?.color ?? "#64748b", padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>
                      {VERIFY_BADGE[a.verify_status]?.label ?? a.verify_status}
                    </span>
                  </td>
                  <td style={{ padding: "8px" }}>{(a.commission_rate * 100).toFixed(0)}%</td>
                  <td style={{ padding: "8px" }}>{a.customer_count}</td>
                  <td style={{ padding: "8px" }}>¥{(a.balance / 100).toFixed(2)}</td>
                  <td style={{ padding: "8px" }}>
                    <select
                      defaultValue={a.level}
                      onChange={(e) => levelMut.mutate({ uid: a.user_id, level: e.target.value })}
                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12 }}
                    >
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

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}
          <button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

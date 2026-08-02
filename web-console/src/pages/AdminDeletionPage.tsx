import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 管理端 — 账号注销审核
 * 对齐 docs/sprint-1/02-account-deletion-frontend.md §3.3
 */

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const icon = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;

const PAGE_HELP = "管理端账号注销审核：查看所有注销请求的状态清单，可查看详情并执行驳回或强制完成操作。强制完成将跳过前置检查直接执行注销。";

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "pending", label: "待审核" },
  { key: "cooling", label: "冷却期" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
  { key: "rejected", label: "已驳回" },
] as const;

export default function AdminDeletionPage() {
  const [help, setHelp] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // 列表查询
  const { data, isLoading } = useQuery({
    queryKey: ["admin/deletion/requests", statusFilter, page],
    queryFn: () =>
      api
        .get("/admin/deletion/requests", {
          params: { status: statusFilter || undefined, page, pageSize: 20 },
        })
        .then((r) => r.data.data),
  });

  // 统计
  const { data: stats } = useQuery({
    queryKey: ["admin/deletion/stats"],
    queryFn: () => api.get("/admin/deletion/stats").then((r) => r.data.data),
  });

  // 详情
  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ["admin/deletion/requests", detailId],
    queryFn: () => api.get(`/admin/deletion/requests/${detailId}`).then((r) => r.data.data),
    enabled: detailId !== null,
  });

  // 驳回
  const rejectMutation = useMutation({
    mutationFn: (body: { id: number; reason: string }) =>
      api.post(`/admin/deletion/requests/${body.id}/reject`, { reason: body.reason }),
    onSuccess: () => {
      setNotice({ type: "success", msg: "注销请求已驳回" });
      setRejectId(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["admin/deletion"] });
    },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  // 强制完成
  const completeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/deletion/requests/${id}/complete`, { force: true }),
    onSuccess: () => {
      setNotice({ type: "success", msg: "管理员强制注销完成" });
      setDetailId(null);
      qc.invalidateQueries({ queryKey: ["admin/deletion"] });
    },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        账号注销审核 <span onClick={() => setHelp(PAGE_HELP)} style={icon} title="帮助">[?]</span>
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>查看和管理用户账号注销请求 · Sprint 1</p>

      {notice && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, background: notice.type === "success" ? "#d1fae5" : "#fee2e2", color: notice.type === "success" ? "#065f46" : "#991b1b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit" }}>×</button>
        </div>
      )}

      {/* 统计卡片 */}
      {stats && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { label: "待审核", value: stats.pending, color: "#f59e0b" },
            { label: "冷却期", value: stats.cooling, color: "#3b82f6" },
            { label: "已完成", value: stats.completed, color: "#10b981" },
            { label: "已驳回", value: stats.rejected, color: "#ef4444" },
            { label: "今日新增", value: stats.todayNew, color: "#8b5cf6" },
            { label: "逾期未确认", value: stats.overdue, color: "#dc2626" },
          ].map((s) => (
            <div key={s.label} style={{ ...card, padding: "12px 16px", minWidth: 100, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 状态 Tab */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatusFilter(t.key); setPage(1); }}
            style={{ ...btnBase, background: statusFilter === t.key ? "#2563eb" : "#fff", color: statusFilter === t.key ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {isLoading ? (
        <p style={{ color: "#94a3b8" }}>加载中...</p>
      ) : data?.list?.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>暂无数据</p>
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>ID</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>用户</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>状态</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>原因</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>冷却截止</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>提交时间</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.list.map((row: any, i: number) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "10px 16px", color: "#334155" }}>{row.id}</td>
                  <td style={{ padding: "10px 16px", color: "#334155" }}>
                    <div>{row.username ?? row.userEmail}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{row.userEmail}</div>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td style={{ padding: "10px 16px", color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.reason ?? "-"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>
                    {row.coolingDeadline ? new Date(row.coolingDeadline).toLocaleDateString("zh-CN") : "-"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>
                    {new Date(row.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <button onClick={() => setDetailId(row.id)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", fontSize: 12 }}>详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid #e2e8f0", fontSize: 13, color: "#64748b" }}>
              <span>共 {data.total} 条，第 {data.page}/{Math.ceil(data.total / data.pageSize)} 页</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ ...btnBase, background: page <= 1 ? "#f1f5f9" : "#2563eb", color: page <= 1 ? "#94a3b8" : "#fff", fontSize: 12, cursor: page <= 1 ? "not-allowed" : "pointer" }}
                >
                  上一页
                </button>
                <button
                  disabled={page >= Math.ceil(data.total / data.pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                  style={{ ...btnBase, background: page >= Math.ceil(data.total / data.pageSize) ? "#f1f5f9" : "#2563eb", color: page >= Math.ceil(data.total / data.pageSize) ? "#94a3b8" : "#fff", fontSize: 12, cursor: page >= Math.ceil(data.total / data.pageSize) ? "not-allowed" : "pointer" }}
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 详情弹窗 */}
      {detailId !== null && detail && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setDetailId(null)}>
          <div style={{ ...card, width: 560, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>
              注销申请 #{detail.request.id}
              <span style={{ fontSize: 13, fontWeight: "normal", marginLeft: 8, color: "#64748b" }}>
                <StatusBadge status={detail.request.status} /> {statusLabel(detail.request.status)}
              </span>
            </h3>

            {/* 用户信息 */}
            {detail.user && (
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                <div style={{ color: "#334155", fontWeight: 600, marginBottom: 8 }}>用户信息</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", color: "#475569" }}>
                  <div>ID: {detail.user.id}</div>
                  <div>邮箱: {detail.user.email}</div>
                  <div>用户名: {detail.user.username ?? "-"}</div>
                  <div>状态: {detail.user.status}</div>
                  <div>余额: ¥{(detail.user.balance / 100).toFixed(2)}</div>
                  <div>实名: {detail.user.realNameStatus}</div>
                  <div>注册时间: {new Date(detail.user.createdAt).toLocaleDateString("zh-CN")}</div>
                </div>
              </div>
            )}

            {/* 申请信息 */}
            <div style={{ fontSize: 13, marginBottom: 16 }}>
              <div style={{ color: "#334155", fontWeight: 600, marginBottom: 8 }}>申请信息</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "#475569" }}>
                <div>原因：{detail.request.reason ?? "未填写"}</div>
                <div>提交时间：{new Date(detail.request.createdAt).toLocaleString("zh-CN")}</div>
                {detail.request.coolingDeadline && <div>冷却截止：{new Date(detail.request.coolingDeadline).toLocaleString("zh-CN")}</div>}
                {detail.request.rejectedReason && <div style={{ color: "#dc2626" }}>驳回原因：{detail.request.rejectedReason}</div>}
                {detail.request.completedAt && <div>完成时间：{new Date(detail.request.completedAt).toLocaleString("zh-CN")}</div>}
              </div>
            </div>

            {/* 检查清单 */}
            {detail.checklist && detail.checklist.length > 0 && (
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                <div style={{ color: "#334155", fontWeight: 600, marginBottom: 8 }}>检查清单</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {detail.checklist.map((item: any) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, color: item.passed === "true" ? "#065f46" : "#dc2626" }}>
                      <span>{item.passed === "true" ? "✅" : "❌"}</span>
                      <span>{item.checkItem}</span>
                      {item.detail && <span style={{ color: "#64748b" }}>— {item.detail}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
              <button onClick={() => setDetailId(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>关闭</button>
              {(detail.request.status === "pending" || detail.request.status === "cooling") && (
                <>
                  <button
                    onClick={() => { setRejectId(detail.request.id); setDetailId(null); }}
                    style={{ ...btnBase, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
                  >
                    驳回
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`确定强制完成用户 #${detail.request.userId} 的注销？此操作不可逆。`)) {
                        completeMutation.mutate(detail.request.id);
                      }
                    }}
                    style={{ ...btnBase, background: "#dc2626", color: "#fff" }}
                  >
                    强制注销
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 驳回弹窗 */}
      {rejectId !== null && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setRejectId(null)}>
          <div style={{ ...card, width: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>驳回注销申请</h3>
            <textarea
              placeholder="请输入驳回原因"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setRejectId(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>取消</button>
              <button
                onClick={() => rejectMutation.mutate({ id: rejectId, reason: rejectReason })}
                disabled={!rejectReason || rejectMutation.isPending}
                style={{ ...btnBase, background: rejectReason ? "#dc2626" : "#e2e8f0", color: rejectReason ? "#fff" : "#94a3b8", cursor: rejectReason ? "pointer" : "not-allowed" }}
              >
                {rejectMutation.isPending ? "提交中..." : "确认驳回"}
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
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: colors[status] ?? "#94a3b8" }} />
      <span>{statusLabel(status)}</span>
    </span>
  );
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

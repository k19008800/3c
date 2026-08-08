import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Pagination, useToast, Modal, ConfirmPopover, SkeletonGroup, EmptyState } from "@3cloud/shared-ui";

/**
 * 管理端 — 账号注销审核
 * 对齐 docs/sprint-1/02-account-deletion-frontend.md §3.3
 */

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

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
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

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
      toast.success("注销请求已驳回");
      setRejectId(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["admin/deletion"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  // 强制完成
  const completeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/deletion/requests/${id}/complete`, { force: true }),
    onSuccess: () => {
      toast.success("管理员强制注销完成");
      setDetailId(null);
      qc.invalidateQueries({ queryKey: ["admin/deletion"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const statusLabel = (s: string) => {
    const labels: Record<string, string> = {
      pending: "待审核", cooling: "冷却期", completed: "已完成", cancelled: "已取消", rejected: "已驳回",
    };
    return labels[s] ?? s;
  };

  const getStatusType = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
    const map: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
      pending: "warning", cooling: "info", completed: "success", cancelled: "default", rejected: "danger",
    };
    return map[s] ?? "default";
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        账号注销审核
        <HelpIcon text={PAGE_HELP} level="page" />
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>查看和管理用户账号注销请求 · Sprint 1</p>

      {/* 统计卡片 */}
      {stats && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { label: "待审核", value: stats.pending, color: "#f59e0b" },
            { label: "冷却期", value: stats.cooling, color: "#3b82f6" },
            { label: "已完成", value: stats.completed, color: "#10b981" },
            { label: "已驳回", value: stats.rejected, color: "#ef4444" },
            { label: "今日新增", value: stats.todayNew, color: "#8b5cf6" },
            { label: "逾期未确认", value: stats.overdue, color: "var(--color-danger-text)" },
          ].map((s) => (
            <div key={s.label} style={{ ...card, padding: "12px 16px", minWidth: 100, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{s.label}</div>
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
            style={{ ...btnBase, background: statusFilter === t.key ? "var(--color-primary)" : "var(--color-panel)", color: statusFilter === t.key ? "#fff" : "#475569", border: `1px solid var(--color-border)` }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {isLoading ? (
        <SkeletonGroup lines={5} />
      ) : data?.list?.length === 0 ? (
        <EmptyState title="暂无数据" description="当前筛选条件无匹配的注销请求" />
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--color-bg)", borderBottom: `1px solid var(--color-border)` }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>ID</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>用户</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>状态</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>原因</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>冷却截止</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>提交时间</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.list.map((row: any, i: number) => (
                <tr key={row.id} style={{ borderBottom: `1px solid var(--color-border)`, background: i % 2 === 0 ? "var(--color-panel)" : "#fafafa" }}>
                  <td style={{ padding: "10px 16px", color: "var(--color-text)" }}>{row.id}</td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text)" }}>
                    <div>{row.username ?? row.userEmail}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{row.userEmail}</div>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <StatusBadge status={getStatusType(row.status)}>{statusLabel(row.status)}</StatusBadge>
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.reason ?? "-"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)", fontSize: 12 }}>
                    {row.coolingDeadline ? new Date(row.coolingDeadline).toLocaleDateString("zh-CN") : "-"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--color-text-secondary)", fontSize: 12 }}>
                    {new Date(row.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <button onClick={() => setDetailId(row.id)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", border: `1px solid var(--color-border)`, fontSize: 12 }}>详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && (
            <Pagination
              current={page}
              total={data.total}
              pageSize={data.pageSize || 20}
              onChange={(p) => setPage(p)}
            />
          )}
        </div>
      )}

      {/* 详情弹窗 */}
      <Modal open={detailId !== null && !!detail} onClose={() => setDetailId(null)} title={`注销申请 ${detail?.request?.id ? `#${detail.request.id}` : ""}`}>
        {detail && (
          <div style={{ fontSize: 13 }}>
            {/* 用户信息 */}
            {detail.user && (
              <div style={{ background: "var(--color-bg)", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                <div style={{ color: "var(--color-text)", fontWeight: 600, marginBottom: 8 }}>用户信息</div>
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
              <div style={{ color: "var(--color-text)", fontWeight: 600, marginBottom: 8 }}>申请信息</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "#475569" }}>
                <div>原因：{detail.request.reason ?? "未填写"}</div>
                <div>提交时间：{new Date(detail.request.createdAt).toLocaleString("zh-CN")}</div>
                {detail.request.coolingDeadline && <div>冷却截止：{new Date(detail.request.coolingDeadline).toLocaleString("zh-CN")}</div>}
                {detail.request.rejectedReason && <div style={{ color: "var(--color-danger-text)" }}>驳回原因：{detail.request.rejectedReason}</div>}
                {detail.request.completedAt && <div>完成时间：{new Date(detail.request.completedAt).toLocaleString("zh-CN")}</div>}
              </div>
            </div>

            {/* 检查清单 */}
            {detail.checklist && detail.checklist.length > 0 && (
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                <div style={{ color: "var(--color-text)", fontWeight: 600, marginBottom: 8 }}>检查清单</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {detail.checklist.map((item: any) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, color: item.passed === "true" ? "var(--color-success-text)" : "var(--color-danger-text)" }}>
                      <span>{item.passed === "true" ? "✅" : "❌"}</span>
                      <span>{item.checkItem}</span>
                      {item.detail && <span style={{ color: "var(--color-text-secondary)" }}>— {item.detail}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: `1px solid var(--color-border)`, paddingTop: 16 }}>
              {(detail.request.status === "pending" || detail.request.status === "cooling") && (
                <>
                  <button onClick={() => { setRejectId(detail.request.id); setDetailId(null); }} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", border: `1px solid #fecaca` }}>驳回</button>
                  <ConfirmPopover title={`确定强制完成用户 #${detail.request.userId} 的注销？此操作不可逆。`} onConfirm={() => completeMutation.mutate(detail.request.id)}>
                    <button style={{ ...btnBase, background: "var(--color-danger-text)", color: "#fff" }}>强制注销</button>
                  </ConfirmPopover>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 驳回弹窗 */}
      <Modal open={rejectId !== null} onClose={() => setRejectId(null)} title="驳回注销申请">
        <textarea
          placeholder="请输入驳回原因"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid var(--color-border)`, width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit", resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={() => setRejectId(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", border: `1px solid var(--color-border)` }}>取消</button>
          <button
            onClick={() => rejectId !== null && rejectMutation.mutate({ id: rejectId, reason: rejectReason })}
            disabled={!rejectReason || rejectMutation.isPending}
            style={{ ...btnBase, background: rejectReason ? "var(--color-danger-text)" : "var(--color-border)", color: rejectReason ? "#fff" : "#94a3b8", cursor: rejectReason ? "pointer" : "not-allowed" }}
          >
            {rejectMutation.isPending ? "提交中..." : "确认驳回"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

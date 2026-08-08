import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface WdItem {
  id: number;
  user_id: number;
  withdrawal_no: string;
  amount: number;
  status: string;
  status_label: string;
  account: string;
  bank: string | null;
  account_name: string | null;
  reject_reason: string | null;
  created_at: string;
  email: string;
  username: string;
}
interface WdDetail extends WdItem {
  first_reviewer_id: number | null;
  first_review_at: string | null;
  first_review_note: string | null;
  second_reviewer_id: number | null;
  second_review_at: string | null;
  second_review_note: string | null;
  transfer_no: string | null;
  completed_at: string | null;
}

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "pending_first_review", label: "待初审" },
  { value: "pending_second_review", label: "待复审" },
  { value: "processing", label: "打款中" },
  { value: "completed", label: "已完成" },
  { value: "rejected", label: "已驳回" },
];

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending_first_review: "warning",
  pending_second_review: "info",
  processing: "info",
  completed: "success",
  rejected: "danger",
};

export default function AdminWithdrawalsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<WdDetail | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const { toast } = useToast();

  const listQ = useQuery({
    queryKey: ["admin-withdrawals", status],
    queryFn: async () =>
      (await api.get<{ data: { list: WdItem[]; pagination: { total: number } } }>(`/admin/agent-withdrawals?status=${status}&page_size=50`)).data.data,
  });

  const reviewMut = useMutation({
    mutationFn: async ({ id, action, stage }: { id: number; action: "approve" | "reject"; stage: "first" | "second" }) =>
      (await api.post(`/admin/agent-withdrawals/${id}/review`, { action, stage, note: reviewNote })).data,
    onSuccess: (d: { data: { message?: string } }) => {
      toast.success(d?.data?.message ?? "操作成功");
      setReviewNote("");
      setDetail(null);
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const transferMut = useMutation({
    mutationFn: async ({ id, result }: { id: number; result: "success" | "failed" }) =>
      (await api.post(`/admin/agent-withdrawals/${id}/transfer`, { result, transfer_no: result === "success" ? `TF${Date.now()}` : undefined })).data,
    onSuccess: (d: { data: { message?: string } }) => {
      toast.success(d?.data?.message ?? "打款处理完成");
      setDetail(null);
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const openDetail = async (id: number) => {
    try {
      const d = (await api.get<{ data: WdDetail }>(`/admin/agent-withdrawals/${id}`)).data.data;
      setDetail(d);
    } catch (e) {
      toast.error(extractError(e));
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        提现审核
        <HelpIcon text="管理代理商的提现申请。支持初审和复审两级审核，审核通过后进入打款流程。可标记打款成功或失败退回。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "var(--color-primary)" : "var(--color-panel)", color: status === f.value ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "var(--color-text-secondary)" }}>共 {listQ.data?.pagination?.total ?? 0} 条</span>
      </div>

      <div style={card}>
        {listQ.isLoading ? (
          <SkeletonGroup lines={6} />
        ) : (listQ.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无提现记录" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>提现单号</th>
                <th style={{ padding: "8px" }}>代理</th>
                <th style={{ padding: "8px" }}>金额</th>
                <th style={{ padding: "8px" }}>收款账户</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>提交时间</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.list.map((w) => (
                <tr key={w.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{w.withdrawal_no}</td>
                  <td style={{ padding: "8px" }}>
                    <div style={{ fontWeight: 600 }}>{w.username || w.email}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{w.email}</div>
                  </td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>¥{w.amount.toFixed(2)}</td>
                  <td style={{ padding: "8px", fontSize: 13, color: "var(--color-text-secondary)" }}>{w.bank ? `${w.bank} ` : ""}{w.account}</td>
                  <td style={{ padding: "8px" }}>
                    <StatusBadge status={STATUS_MAP[w.status] ?? "default"}>{w.status_label}</StatusBadge>
                  </td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{new Date(w.created_at).toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => openDetail(w.id)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>
                      审核
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 审核弹窗 */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`提现审核 #${detail?.withdrawal_no ?? ""}`} width={520}>
        {detail && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, marginBottom: 16 }}>
              <div>代理: <strong>{detail.username || detail.email}</strong></div>
              <div>金额: <strong style={{ color: "var(--color-success-text)" }}>¥{detail.amount.toFixed(2)}</strong></div>
              <div>收款账户: <strong>{detail.account}</strong></div>
              <div>开户行: <strong>{detail.bank ?? "-"}</strong></div>
              <div>收款人: <strong>{detail.account_name ?? "-"}</strong></div>
              <div>当前状态: <StatusBadge status={STATUS_MAP[detail.status] ?? "default"}>{detail.status_label}</StatusBadge></div>
              {detail.first_review_note && <div style={{ gridColumn: "1/-1" }}>初审意见: <span style={{ color: "var(--color-text-secondary)" }}>{detail.first_review_note}</span></div>}
              {detail.second_review_note && <div style={{ gridColumn: "1/-1" }}>复审意见: <span style={{ color: "var(--color-text-secondary)" }}>{detail.second_review_note}</span></div>}
              {detail.reject_reason && <div style={{ gridColumn: "1/-1" }}>驳回原因: <span style={{ color: "var(--color-danger-text)" }}>{detail.reject_reason}</span></div>}
              {detail.transfer_no && <div style={{ gridColumn: "1/-1" }}>打款流水号: <strong style={{ fontFamily: "monospace", fontSize: 12 }}>{detail.transfer_no}</strong></div>}
            </div>

            <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="审核意见（拒绝时必填原因）" rows={3} style={inp} />

            {detail.status === "pending_first_review" && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => reviewMut.mutate({ id: detail.id, action: "reject", stage: "first" })} disabled={reviewMut.isPending} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)" }}>初审驳回</button>
                <button onClick={() => reviewMut.mutate({ id: detail.id, action: "approve", stage: "first" })} disabled={reviewMut.isPending} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>初审通过</button>
              </div>
            )}
            {detail.status === "pending_second_review" && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => reviewMut.mutate({ id: detail.id, action: "reject", stage: "second" })} disabled={reviewMut.isPending} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)" }}>复审驳回</button>
                <button onClick={() => reviewMut.mutate({ id: detail.id, action: "approve", stage: "second" })} disabled={reviewMut.isPending} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>复审通过</button>
              </div>
            )}
            {detail.status === "processing" && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => transferMut.mutate({ id: detail.id, result: "failed" })} disabled={transferMut.isPending} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)" }}>打款失败退回</button>
                <button onClick={() => transferMut.mutate({ id: detail.id, result: "success" })} disabled={transferMut.isPending} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff" }}>标记打款成功</button>
              </div>
            )}
            {(detail.status === "completed" || detail.status === "rejected") && (
              <div style={{ textAlign: "right", color: "var(--color-text-secondary)", fontSize: 13 }}>该提现已终态</div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

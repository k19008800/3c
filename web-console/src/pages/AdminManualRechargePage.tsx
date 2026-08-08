import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface ManualTopup {
  id: number; user_id: number; username: string; email: string;
  amount: number; evidence_url: string | null; evidence_remark: string | null;
  status: string; status_label: string; review_note: string | null;
  transfer_no: string | null; reviewer_id: number | null; created_at: string;
}

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
];

export default function AdminManualRechargePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<ManualTopup | null>(null);
  const [review, setReview] = useState<{ id: number; action: "approve" | "reject"; note: string } | null>(null);

  const q = useQuery({
    queryKey: ["admin-manual-topup", status],
    queryFn: async () => (await api.get<{ data: { list: ManualTopup[]; pagination: { total: number } } }>(`/admin/manual-topup?status=${status}&page_size=50`)).data.data,
  });

  const reviewMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/manual-topup/${review?.id}/review`, { action: review?.action, note: review?.note })).data,
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "审核完成"); setReview(null); qc.invalidateQueries({ queryKey: ["admin-manual-topup"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        ✋ 人工上账
        <HelpIcon text="处理对公转账人工上账，查看凭证 → 确认金额 → 通过/驳回。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "var(--color-primary)" : "var(--color-panel)", color: status === f.value ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-secondary)" }}>共 {q.data?.pagination?.total ?? 0} 条</span>
      </div>

      <div style={card}>
        {q.isLoading ? <SkeletonGroup lines={6} /> : (q.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无上账申请" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>申请时间</th>
                <th style={{ padding: "8px" }}>客户</th>
                <th style={{ padding: "8px" }}>金额</th>
                <th style={{ padding: "8px" }}>凭证</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.list ?? []).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                  <td style={{ padding: "8px" }}>
                    <div style={{ fontWeight: 600 }}>{r.username || r.email}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.email}</div>
                  </td>
                  <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-success-text)" }}>¥{r.amount.toFixed(2)}</td>
                  <td style={{ padding: "8px" }}>
                    {r.evidence_url ? <a href={r.evidence_url} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>查看凭证</a> : <span style={{ color: "var(--color-text-secondary)" }}>-</span>}
                  </td>
                  <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[r.status] ?? "warning"}>{r.status_label}</StatusBadge></td>
                  <td style={{ padding: "8px" }}>
                    {r.status === "pending" ? (
                      <>
                        <button onClick={() => setReview({ id: r.id, action: "approve", note: "" })} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", padding: "4px 10px" }}>通过</button>
                        <button onClick={() => setReview({ id: r.id, action: "reject", note: "" })} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", padding: "4px 10px", marginLeft: 6 }}>驳回</button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.status === "approved" ? "已入账" : r.review_note ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!review} onClose={() => setReview(null)} title={review?.action === "approve" ? "确认通过上账" : "驳回上账申请"} width={400}>
        {review && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
              {review.action === "approve" ? "确认后金额将立即入账到客户账户。" : "请填写驳回原因。"}
            </div>
            <textarea value={review.note} onChange={(e) => setReview({ ...review, note: e.target.value })} placeholder={review.action === "approve" ? "审核意见（选填）" : "驳回原因（必填）"} rows={3} style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setReview(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button
                onClick={() => reviewMut.mutate()}
                disabled={review.action === "reject" && !review.note}
                style={{ ...btnBase, background: review.action === "approve" ? "var(--color-primary)" : "var(--color-danger-text)", color: "#fff" }}
              >
                {reviewMut.isPending ? "提交中..." : review.action === "approve" ? "确认通过" : "确认驳回"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

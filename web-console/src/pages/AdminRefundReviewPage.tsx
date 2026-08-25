import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { withOperation2fa, isOperation2faCanceled, operation2faErrorText, operation2faHeaders } from "../lib/operation-2fa";
import type { OperationSummaryItem } from "../components/Operation2faModal";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

interface RefundItem {
  id: number; user_id: number; username: string; email: string;
  amount: number; reason: string; order_no: string;
  status: string; status_label: string; review_note: string | null;
  reviewed_by: number | null; reviewed_at: string | null; created_at: string;
}

/** 审核/驳回（原因输入弹窗保留；R7 两步弹窗承载摘要确认） */
interface ReviewState {
  id: number;
  action: "approve" | "reject";
  note: string;
  summary?: OperationSummaryItem[];
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

/* PRD §8 按钮级帮助对照表（P1 不可降级；退款审核纳入 R7，双签裁决 B16） */
const HELP_APPROVE = "确认退款申请有效，款项退回到用户余额；资金写操作需操作级 2FA + 二次确认";
const HELP_REJECT = "拒绝该退款申请，必须填写驳回原因；单据变为已驳回，不改变用户余额";
const HELP_CONFIRM_EXECUTE = "确认执行：二次确认，核对操作摘要后确认提交，与 2FA 验证共同构成资金操作放行的两个必要条件";

/* 页面帮助（退款审核纳入 R7：通过/驳回需 2FA + 二次确认，双签裁决 B16） */
const PAGE_HELP = [
  "【功能定位】处理用户退款申请，查看详情 → 通过/驳回；通过后款项退回到用户余额。",
  "",
  "【核心操作】",
  "1. 查看待审核退款列表（退款原因 / 原订单号核对）",
  "2. 通过：核对退款金额与原因 → 二次确认 + 操作级 2FA → 款项退回用户余额",
  "3. 驳回：必须填写驳回原因，单据变为已驳回",
  "",
  "【注意事项】",
  "- 通过/驳回均为资金写操作，后端强制 2FA + 二次确认（验证结果 5 分钟内有效）",
  "- 退款通过后用户余额即时变动并写流水与审计日志",
].join("\n");

export default function AdminRefundReviewPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const [review, setReview] = useState<ReviewState | null>(null);

  const q = useQuery({
    queryKey: ["admin-refunds", status],
    queryFn: async () => (await api.get<{ data: { list: RefundItem[]; pagination: { total: number } } }>(`/admin/refunds?status=${status}&page_size=50`)).data.data,
  });

  /** R7 两步弹窗第二步操作摘要 */
  const buildReviewSummary = (r: RefundItem, action: "approve" | "reject"): OperationSummaryItem[] => [
    { label: "操作类型", value: action === "approve" ? "退款审核 · 通过" : "退款审核 · 驳回" },
    { label: "用户", value: r.username || r.email },
    { label: "退款金额", value: `¥${r.amount.toFixed(2)}`, highlight: true },
    { label: "退款原因", value: r.reason || "-" },
    { label: "原订单号", value: r.order_no },
  ];

  const reviewMut = useMutation({
    mutationFn: async () => withOperation2fa(async (ctx) => {
      return (await api.post(`/admin/refunds/${review?.id}/review`, { action: review?.action, note: review?.note }, { headers: operation2faHeaders(ctx) })).data;
    }, review?.summary),
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "审核完成"); setReview(null); qc.invalidateQueries({ queryKey: ["admin-refunds"] }); },
    onError: (e) => { if (isOperation2faCanceled(e)) return; toast.error(operation2faErrorText(e) ?? extractError(e)); },
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        ↩️ 退款审核
        <HelpIcon text={PAGE_HELP} level="page" />
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
        {q.isLoading ? <SkeletonGroup lines={4} /> : (q.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无退款申请" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>申请时间</th>
                <th style={{ padding: "8px" }}>客户</th>
                <th style={{ padding: "8px" }}>退款金额</th>
                <th style={{ padding: "8px" }}>退款原因</th>
                <th style={{ padding: "8px" }}>原订单号</th>
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
                  <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-danger-text)" }}>¥{r.amount.toFixed(2)}</td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{r.reason || "-"}</td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{r.order_no}</td>
                  <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[r.status] ?? "warning"}>{r.status_label}</StatusBadge></td>
                  <td style={{ padding: "8px" }}>
                    {r.status === "pending" ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => setReview({ id: r.id, action: "approve", note: "", summary: buildReviewSummary(r, "approve") })} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff", padding: "4px 10px" }}>通过</button>
                        <HelpIcon text={HELP_APPROVE} />
                        <button onClick={() => setReview({ id: r.id, action: "reject", note: "", summary: buildReviewSummary(r, "reject") })} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", padding: "4px 10px" }}>驳回</button>
                        <HelpIcon text={HELP_REJECT} />
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.status === "approved" ? "已退款" : r.review_note ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!review} onClose={() => setReview(null)} title={review?.action === "approve" ? "确认通过退款" : "驳回退款申请"} width={400}>
        {review && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
              {review.action === "approve" ? "确认后款项将退回到客户账户余额。本操作为资金写操作，确认后进入操作级 2FA 两步验证（身份验证 → 摘要确认执行）。" : "请填写驳回原因。"}
            </div>
            <textarea value={review.note} onChange={(e) => setReview({ ...review, note: e.target.value })} placeholder={review.action === "approve" ? "审核意见（选填）" : "驳回原因（必填）"} rows={3} style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setReview(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={() => reviewMut.mutate()}
                  disabled={review.action === "reject" && !review.note}
                  style={{ ...btnBase, background: review.action === "approve" ? "var(--color-success-text)" : "var(--color-danger-text)", color: "#fff" }}
                >
                  {reviewMut.isPending ? "提交中..." : review.action === "approve" ? "确认通过" : "确认驳回"}
                </button>
                <HelpIcon text={HELP_CONFIRM_EXECUTE} />
              </span>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

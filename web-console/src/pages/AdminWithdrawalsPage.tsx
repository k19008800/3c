import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

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

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "pending_first_review", label: "待初审" },
  { value: "pending_second_review", label: "待复审" },
  { value: "processing", label: "打款中" },
  { value: "completed", label: "已完成" },
  { value: "rejected", label: "已驳回" },
];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending_first_review: { bg: "#fef3c7", color: "#92400e" },
  pending_second_review: { bg: "#dbeafe", color: "#1e40af" },
  processing: { bg: "#ede9fe", color: "#6d28d9" },
  completed: { bg: "#dcfce7", color: "#166534" },
  rejected: { bg: "#fee2e2", color: "#991b1b" },
};

export default function AdminWithdrawalsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<WdDetail | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-withdrawals", status],
    queryFn: async () =>
      (await api.get<{ data: { list: WdItem[]; pagination: { total: number } } }>(`/admin/agent-withdrawals?status=${status}&page_size=50`)).data.data,
  });

  const reviewMut = useMutation({
    mutationFn: async ({ id, action, stage }: { id: number; action: "approve" | "reject"; stage: "first" | "second" }) =>
      (await api.post(`/admin/agent-withdrawals/${id}/review`, { action, stage, note: reviewNote })).data,
    onSuccess: (d: { data: { message?: string } }) => {
      setNotice({ type: "success", msg: d?.data?.message ?? "操作成功" });
      setReviewNote("");
      setDetail(null);
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const transferMut = useMutation({
    mutationFn: async ({ id, result }: { id: number; result: "success" | "failed" }) =>
      (await api.post(`/admin/agent-withdrawals/${id}/transfer`, { result, transfer_no: result === "success" ? `TF${Date.now()}` : undefined })).data,
    onSuccess: (d: { data: { message?: string } }) => {
      setNotice({ type: "success", msg: d?.data?.message ?? "打款处理完成" });
      setDetail(null);
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const openDetail = async (id: number) => {
    try {
      const d = (await api.get<{ data: WdDetail }>(`/admin/agent-withdrawals/${id}`)).data.data;
      setDetail(d);
    } catch (e) {
      setNotice({ type: "error", msg: extractError(e) });
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>提现审核</h2>

      {/* 状态筛选 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            style={{
              ...btnBase,
              background: status === f.value ? "#2563eb" : "#fff",
              color: status === f.value ? "#fff" : "#475569",
              border: "1px solid #cbd5e1",
            }}
          >
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "#64748b" }}>共 {listQ.data?.pagination?.total ?? 0} 条</span>
      </div>

      {/* 列表 */}
      <div style={card}>
        {listQ.isLoading ? (
          <div style={{ color: "#94a3b8" }}>加载中...</div>
        ) : (listQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无提现记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
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
                <tr key={w.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{w.withdrawal_no}</td>
                  <td style={{ padding: "8px" }}>
                    <div style={{ fontWeight: 600 }}>{w.username || w.email}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{w.email}</div>
                  </td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>¥{w.amount.toFixed(2)}</td>
                  <td style={{ padding: "8px", fontSize: 13, color: "#64748b" }}>{w.bank ? `${w.bank} ` : ""}{w.account}</td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ ...(STATUS_STYLE[w.status] ?? STATUS_STYLE.pending_first_review), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>
                      {w.status_label}
                    </span>
                  </td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{new Date(w.created_at).toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => openDetail(w.id)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>
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
      {detail && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 520, maxHeight: "85vh", overflow: "auto" }}>
            <h3 style={{ marginBottom: 16 }}>提现审核 #{detail.withdrawal_no}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, marginBottom: 16 }}>
              <div>代理: <strong>{detail.username || detail.email}</strong></div>
              <div>金额: <strong style={{ color: "#166534" }}>¥{detail.amount.toFixed(2)}</strong></div>
              <div>收款账户: <strong>{detail.account}</strong></div>
              <div>开户行: <strong>{detail.bank ?? "-"}</strong></div>
              <div>收款人: <strong>{detail.account_name ?? "-"}</strong></div>
              <div>当前状态: <strong style={{ color: STATUS_STYLE[detail.status]?.color }}>{detail.status_label}</strong></div>
              {detail.first_review_note && <div style={{ gridColumn: "1/-1" }}>初审意见: <span style={{ color: "#64748b" }}>{detail.first_review_note}</span></div>}
              {detail.second_review_note && <div style={{ gridColumn: "1/-1" }}>复审意见: <span style={{ color: "#64748b" }}>{detail.second_review_note}</span></div>}
              {detail.reject_reason && <div style={{ gridColumn: "1/-1" }}>驳回原因: <span style={{ color: "#991b1b" }}>{detail.reject_reason}</span></div>}
              {detail.transfer_no && <div style={{ gridColumn: "1/-1" }}>打款流水号: <strong style={{ fontFamily: "monospace", fontSize: 12 }}>{detail.transfer_no}</strong></div>}
            </div>

            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="审核意见（拒绝时必填原因）"
              rows={3}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", boxSizing: "border-box", marginBottom: 16, fontFamily: "inherit" }}
            />

            {/* 按状态给操作按钮 */}
            {detail.status === "pending_first_review" && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => reviewMut.mutate({ id: detail.id, action: "reject", stage: "first" })} disabled={reviewMut.isPending} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b" }}>初审驳回</button>
                <button onClick={() => reviewMut.mutate({ id: detail.id, action: "approve", stage: "first" })} disabled={reviewMut.isPending} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>初审通过</button>
              </div>
            )}
            {detail.status === "pending_second_review" && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => reviewMut.mutate({ id: detail.id, action: "reject", stage: "second" })} disabled={reviewMut.isPending} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b" }}>复审驳回</button>
                <button onClick={() => reviewMut.mutate({ id: detail.id, action: "approve", stage: "second" })} disabled={reviewMut.isPending} style={{ ...btnBase, background: "#7c3aed", color: "#fff" }}>复审通过</button>
              </div>
            )}
            {detail.status === "processing" && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => transferMut.mutate({ id: detail.id, result: "failed" })} disabled={transferMut.isPending} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b" }}>打款失败退回</button>
                <button onClick={() => transferMut.mutate({ id: detail.id, result: "success" })} disabled={transferMut.isPending} style={{ ...btnBase, background: "#16a34a", color: "#fff" }}>标记打款成功</button>
              </div>
            )}
            {(detail.status === "completed" || detail.status === "rejected") && (
              <div style={{ textAlign: "right", color: "#94a3b8", fontSize: 13 }}>该提现已终态</div>
            )}

            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button onClick={() => setDetail(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}
          <button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

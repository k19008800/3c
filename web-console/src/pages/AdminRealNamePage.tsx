import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface Rn {
  id: number;
  user_id: number;
  type: string;
  type_label: string;
  real_name: string;
  id_number: string;
  phone: string | null;
  status: string;
  status_label: string;
  reject_reason: string | null;
  created_at: string;
  email: string;
  username: string;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending_review: { bg: "#fef3c7", color: "#92400e" },
  approved: { bg: "#dcfce7", color: "#166534" },
  rejected: { bg: "#fee2e2", color: "#991b1b" },
  unverified: { bg: "#f1f5f9", color: "#475569" },
};
const FILTERS = [
  { value: "", label: "全部" },
  { value: "pending_review", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
];

export default function AdminRealNamePage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-real-name", status],
    queryFn: async () => (await api.get<{ data: { list: Rn[]; pagination: { total: number } } }>(`/admin/real-name?status=${status}&page_size=50`)).data.data,
  });

  const reviewMut = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => (await api.post(`/admin/real-name/${id}/review`, { action })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已处理" }); qc.invalidateQueries({ queryKey: ["admin-real-name"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>实名认证审核</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "#2563eb" : "#fff", color: status === f.value ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b" }}>共 {listQ.data?.pagination?.total ?? 0} 条</span>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无实名记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>用户</th>
                <th style={{ padding: "8px" }}>类型</th>
                <th style={{ padding: "8px" }}>真实姓名</th>
                <th style={{ padding: "8px" }}>证件号</th>
                <th style={{ padding: "8px" }}>手机</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>申请时间</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.list.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px" }}><div style={{ fontWeight: 600 }}>{r.username || r.email}</div><div style={{ fontSize: 12, color: "#64748b" }}>{r.email}</div></td>
                  <td style={{ padding: "8px" }}>{r.type_label}</td>
                  <td style={{ padding: "8px" }}>{r.real_name}</td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 13 }}>{r.id_number}</td>
                  <td style={{ padding: "8px" }}>{r.phone ?? "-"}</td>
                  <td style={{ padding: "8px" }}><span style={{ ...(STATUS_STYLE[r.status] ?? STATUS_STYLE.pending_review), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{r.status_label}</span></td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>
                    {r.status === "pending_review" && (
                      <>
                        <button onClick={() => reviewMut.mutate({ id: r.id, action: "approve" })} style={{ ...btnBase, background: "#16a34a", color: "#fff", padding: "4px 10px" }}>通过</button>
                        <button onClick={() => reviewMut.mutate({ id: r.id, action: "reject" })} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b", padding: "4px 10px", marginLeft: 6 }}>驳回</button>
                      </>
                    )}
                    {r.status !== "pending_review" && <span style={{ fontSize: 12, color: "#94a3b8" }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

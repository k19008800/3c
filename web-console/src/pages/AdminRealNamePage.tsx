import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

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

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending_review: "warning",
  approved: "success",
  rejected: "danger",
  unverified: "default",
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
  const { toast } = useToast();

  const listQ = useQuery({
    queryKey: ["admin-real-name", status],
    queryFn: async () => (await api.get<{ data: { list: Rn[]; pagination: { total: number } } }>(`/admin/real-name?status=${status}&page_size=50`)).data.data,
  });

  const reviewMut = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => (await api.post(`/admin/real-name/${id}/review`, { action })).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已处理"); qc.invalidateQueries({ queryKey: ["admin-real-name"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        实名认证审核
        <HelpIcon text="管理用户实名认证申请。审核用户提交的身份信息，通过或驳回认证请求。支持按状态筛选。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "var(--color-primary)" : "var(--color-panel)", color: status === f.value ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-secondary)" }}>共 {listQ.data?.pagination?.total ?? 0} 条</span>
      </div>

      <div style={card}>
        {listQ.isLoading ? (
          <SkeletonGroup lines={6} />
        ) : (listQ.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无实名记录" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
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
                <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px" }}><div style={{ fontWeight: 600 }}>{r.username || r.email}</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.email}</div></td>
                  <td style={{ padding: "8px" }}>{r.type_label}</td>
                  <td style={{ padding: "8px" }}>{r.real_name}</td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 13 }}>{r.id_number}</td>
                  <td style={{ padding: "8px" }}>{r.phone ?? "-"}</td>
                  <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[r.status] ?? "default"}>{r.status_label}</StatusBadge></td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>
                    {r.status === "pending_review" && (
                      <>
                        <button onClick={() => reviewMut.mutate({ id: r.id, action: "approve" })} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff", padding: "4px 10px" }}>通过</button>
                        <button onClick={() => reviewMut.mutate({ id: r.id, action: "reject" })} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", padding: "4px 10px", marginLeft: 6 }}>驳回</button>
                      </>
                    )}
                    {r.status !== "pending_review" && <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

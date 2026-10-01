import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { StatusBadge, Pagination, SkeletonGroup, useToast, PageHeader } from "@3cloud/shared-ui";

/* ───────── 真实接口契约（GET /admin/content-moderation） ───────── */

interface ModRecord {
  id: number;
  user_id: number;
  username: string | null;
  content_type: string;
  content: string;
  content_preview: string;
  status: string; // pending / approved / rejected
  moderator_id: number | null;
  moderator_name: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const PAGE_SIZE = 20;

export default function AdminContentModerationPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const listQ = useQuery({
    queryKey: ["admin-content-moderation", status, page],
    queryFn: async () => (await api.get(`/admin/content-moderation?status=${status}&page=${page}&page_size=${PAGE_SIZE}`)).data.data,
    retry: 0,
  });

  const reviewMut = useMutation<any, unknown, { id: number; op: "approve" | "reject" }>({
    mutationFn: async ({ id, op }: { id: number; op: "approve" | "reject" }) =>
      (await api.post(`/admin/content-moderation/${id}/${op}`, {})).data,
    onSuccess: () => { toast.success("审核完成"); qc.invalidateQueries({ queryKey: ["admin-content-moderation"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  const list = listQ.data?.list ?? [];
  const total = listQ.data?.pagination?.total ?? 0;

  const statusBadge = (s: string) => {
    const map: Record<string, ["success" | "warning" | "danger" | "default", string]> = {
      pending: ["warning", "待审核"], approved: ["success", "已通过"], rejected: ["danger", "已拒绝"],
    };
    const [v, label] = map[s] ?? ["default", s];
    return <StatusBadge status={v}>{label}</StatusBadge>;
  };

  return (
    <div>
      <PageHeader title="内容审核" help="对用户生成内容进行审核：通过或拒绝违规内容，查看审核记录。" />

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }}>
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已拒绝</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>共 {total} 条</span>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "var(--color-divider-light)" }}>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>用户</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>类型</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>内容预览</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>审核人</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>操作</th>
            </tr></thead>
            <tbody>
              {list.map((r: ModRecord) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--color-divider)" }}>
                  <td style={{ padding: "8px 14px" }}>{r.username ?? `#${r.user_id}`}</td>
                  <td style={{ padding: "8px 14px" }}>{r.content_type}</td>
                  <td style={{ padding: "8px 14px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--color-text-secondary)" }} title={r.content}>{r.content_preview}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>{statusBadge(r.status)}</td>
                  <td style={{ padding: "8px 14px", fontSize: 12, color: "var(--color-text-secondary)" }}>{r.moderator_name ?? "—"}</td>
                  <td style={{ padding: "8px 14px", fontSize: 12, color: "var(--color-text-secondary)" }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>
                    {r.status === "pending" && (
                      <>
                        <button onClick={() => reviewMut.mutate({ id: r.id, op: "approve" })} style={{ padding: "3px 10px", border: "1px solid var(--color-success-text)", borderRadius: 4, background: "var(--color-success-bg)", color: "var(--color-success-text)", cursor: "pointer", marginRight: 4, fontSize: 11 }}>通过</button>
                        <button onClick={() => reviewMut.mutate({ id: r.id, op: "reject" })} style={{ padding: "3px 10px", border: "1px solid var(--color-danger-text)", borderRadius: 4, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", cursor: "pointer", fontSize: 11 }}>拒绝</button>
                      </>
                    )}
                    {r.status !== "pending" && <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.status === "approved" ? "" : ""}</span>}
                  </td>
                </tr>
              ))}
              {list.length === 0 && !listQ.isLoading && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>暂无审核记录</td></tr>
              )}
            </tbody>
          </table>
        )}
        {total > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}>
            <Pagination current={page} total={total} pageSize={PAGE_SIZE} onChange={(p) => setPage(p)} />
          </div>
        )}
      </div>
    </div>
  );
}

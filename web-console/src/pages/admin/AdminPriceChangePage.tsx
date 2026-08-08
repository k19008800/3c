import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminPriceChangePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [editItem, setEditItem] = useState<any>(null);

  const listQ = useQuery({
    queryKey: ["admin-price-changes", keyword],
    queryFn: async () => (await api.get(`/admin/price-changes?keyword=${keyword}&page_size=50`)).data.data,
  });

  const notifyMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/price-changes/${id}/notify`, {})).data,
    onSuccess: () => { toast.success("通知已发送"); qc.invalidateQueries({ queryKey: ["admin-price-changes"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  const approveMut = useMutation({
    mutationFn: async ({ id, op }: { id: number; op: "approve" | "reject" }) =>
      (await api.post(`/admin/price-changes/${id}/${op}`, {})).data,
    onSuccess: () => { toast.success("审核完成"); qc.invalidateQueries({ queryKey: ["admin-price-changes"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>价格变更通知</h2>
        <HelpIcon helpKey="price_change" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索模型..." value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📢 价格变更列表 <HelpIcon helpKey="price_change" /></div>
        {listQ.isLoading ? <SkeletonGroup count={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>模型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>变更类型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>原价格</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>新价格</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>幅度</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(listQ.data?.list ?? []).map((pc: any) => (
                <tr key={pc.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{pc.display_name ?? pc.model_name}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{pc.vendor_name}</td>
                  <td style={{ padding: "10px 12px", color: pc.direction === "up" ? "#e53935" : "#22c55e" }}>
                    {pc.direction === "up" ? "📈 涨价" : "📉 降价"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>¥{pc.old_price}</td>
                  <td style={{ padding: "10px 12px" }}>¥{pc.new_price}</td>
                  <td style={{ padding: "10px 12px", color: pc.change_pct > 0 ? "#e53935" : "#22c55e" }}>
                    {pc.change_pct > 0 ? "+" : ""}{pc.change_pct}%
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={pc.status === "approved" ? "success" : pc.status === "pending" ? "warning" : "default"}>
                      {{ pending: "待审批", approved: "已通过", rejected: "已驳回", notified: "已通知" }[pc.status] ?? pc.status}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                    {pc.status === "pending" && (
                      <>
                        <button style={{ ...btnBase, background: "#22c55e", color: "#fff", fontSize: 12 }} onClick={() => approveMut.mutate({ id: pc.id, op: "approve" })}>通过</button>
                        <button style={{ ...btnBase, background: "#e53935", color: "#fff", fontSize: 12 }} onClick={() => approveMut.mutate({ id: pc.id, op: "reject" })}>驳回</button>
                      </>
                    )}
                    {pc.status === "approved" && (
                      <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 12 }} onClick={() => notifyMut.mutate(pc.id)}>通知用户</button>
                    )}
                    {pc.status === "notified" && <span style={{ fontSize: 11, color: "#888" }}>已完成</span>}
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

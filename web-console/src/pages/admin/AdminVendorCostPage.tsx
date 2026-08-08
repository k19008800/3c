import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminVendorCostPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [editItem, setEditItem] = useState<any>(null);

  const listQ = useQuery({
    queryKey: ["admin-vendor-costs", keyword],
    queryFn: async () => (await api.get(`/admin/vendor-costs?keyword=${keyword}&page_size=50`)).data.data,
  });

  const saveMut = useMutation({
    mutationFn: async (body: any) =>
      (await api.put(`/admin/vendor-costs/${body.id}`, body)).data,
    onSuccess: () => { toast.success("成本已更新"); setEditItem(null); qc.invalidateQueries({ queryKey: ["admin-vendor-costs"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>供应商成本管理</h2>
        <HelpIcon helpKey="vendor_cost" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索模型/供应商..." value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📦 成本管理列表 <HelpIcon helpKey="vendor_cost" /></div>
        {listQ.isLoading ? <SkeletonGroup count={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>模型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>采购成本(输入)</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>采购成本(输出)</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>售价(输入/输出)</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>毛利率</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(listQ.data?.list ?? []).map((c: any) => {
                const margin = c.sell_input_price && c.cost_input_price
                  ? Math.round((1 - c.cost_input_price / c.sell_input_price) * 100) : null;
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500 }}>{c.display_name ?? c.model_name}</td>
                    <td style={{ padding: "10px 12px", color: "#888" }}>{c.vendor_name}</td>
                    <td style={{ padding: "10px 12px" }}>¥{c.cost_input_price}</td>
                    <td style={{ padding: "10px 12px" }}>¥{c.cost_output_price}</td>
                    <td style={{ padding: "10px 12px" }}>¥{c.sell_input_price} / ¥{c.sell_output_price}</td>
                    <td style={{ padding: "10px 12px", color: margin != null && margin < 15 ? "#e53935" : margin != null ? "#22c55e" : "#888" }}>
                      {margin != null ? `${margin}%` : "—"}
                      {margin != null && margin < 15 ? " ⚠️" : ""}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}
                        onClick={() => setEditItem(c)}>更新成本</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editItem && (
        <Modal open onClose={() => setEditItem(null)} title={`更新成本 - ${editItem.display_name ?? editItem.model_name}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
            <label>采购成本(输入/1K tokens) <input type="number" step="0.0001" value={editItem.cost_input_price || 0}
              onChange={e => setEditItem({ ...editItem, cost_input_price: Number(e.target.value) })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }} /></label>
            <label>采购成本(输出/1K tokens) <input type="number" step="0.0001" value={editItem.cost_output_price || 0}
              onChange={e => setEditItem({ ...editItem, cost_output_price: Number(e.target.value) })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }} /></label>
            <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", marginTop: 8 }}
              onClick={() => saveMut.mutate(editItem)}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminSupplierDetailPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [keyword, setKeyword] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-vendors-list"],
    queryFn: async () => (await api.get("/admin/vendors/all")).data.data,
  });

  const detailQ = useQuery({
    queryKey: ["admin-vendor-detail", selected?.id],
    queryFn: async () => (await api.get(`/admin/vendors/${selected!.id}`)).data.data,
    enabled: !!selected?.id,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>供应商详情</h2>
        <HelpIcon helpKey="supplier_detail" />
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
            placeholder="搜索供应商关键词..." value={keyword} onChange={e => setKeyword(e.target.value)} />
          <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff" }}>搜索</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#f8f9fa" }}>
            <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
            <th style={{ padding: "10px 12px", textAlign: "left" }}>API 格式</th>
            <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
            <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
          </tr></thead>
          <tbody>
            {(listQ.data?.list ?? []).filter((v: any) => !keyword || v.name.includes(keyword)).map((v: any) => (
              <tr key={v.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                <td style={{ padding: "10px 12px", fontWeight: 500 }}>{v.name} <span style={{ color: "#888", fontSize: 11 }}>({v.code})</span></td>
                <td style={{ padding: "10px 12px", color: "#888" }}>{v.api_format ?? "—"}</td>
                <td style={{ padding: "10px 12px" }}>{v.is_active ? "✅ 启用" : "⛔ 禁用"}</td>
                <td style={{ padding: "10px 12px" }}>
                  <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 12 }} onClick={() => setSelected(v)}>查看详情</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`供应商详情 - ${selected.name}`}>
          {detailQ.isLoading ? <SkeletonGroup count={5} /> : (
            <div style={{ padding: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
                <div><strong>名称:</strong> {detailQ.data?.vendor?.name ?? selected.name}</div>
                <div><strong>代码:</strong> {detailQ.data?.vendor?.code ?? selected.code}</div>
                <div><strong>Base URL:</strong> {detailQ.data?.vendor?.base_url ?? selected.base_url ?? "—"}</div>
                <div><strong>API 格式:</strong> {detailQ.data?.vendor?.api_format ?? "—"}</div>
                <div><strong>状态:</strong> {detailQ.data?.vendor?.status_label ?? "—"}</div>
                <div><strong>货币:</strong> {detailQ.data?.vendor?.currency ?? "CNY"}</div>
              </div>
              {detailQ.data?.models && (
                <div style={{ marginTop: 16 }}>
                  <h4>关联模型 ({detailQ.data.models.length})</h4>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 }}>
                    <thead><tr style={{ background: "#f8f9fa" }}>
                      <th style={{ padding: "8px", textAlign: "left" }}>模型名</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>上游模型</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>成本 (输入)</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>成本 (输出)</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>健康分</th>
                    </tr></thead>
                    <tbody>
                      {detailQ.data.models.map((m: any) => (
                        <tr key={m.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "8px" }}>{m.display_name ?? m.model_name}</td>
                          <td style={{ padding: "8px" }}>{m.upstream_model}</td>
                          <td style={{ padding: "8px" }}>¥{m.cost_input_price}</td>
                          <td style={{ padding: "8px" }}>¥{m.cost_output_price}</td>
                          <td style={{ padding: "8px" }}>{m.health_score ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

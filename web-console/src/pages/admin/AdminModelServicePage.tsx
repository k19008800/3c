import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast, ConfirmPopover } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminModelServicePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [vendorId, setVendorId] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-model-services", keyword, vendorId],
    queryFn: async () => (await api.get(`/admin/vendor-models?keyword=${keyword}&vendor_id=${vendorId}&page_size=50`)).data.data,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      (await api.put(`/admin/vendor-models/${id}`, { is_enabled: enabled })).data,
    onSuccess: () => { toast.success("已更新"); qc.invalidateQueries({ queryKey: ["admin-model-services"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  const priorityMut = useMutation({
    mutationFn: async ({ id, priority }: { id: number; priority: number }) =>
      (await api.put(`/admin/vendor-models/${id}`, { priority })).data,
    onSuccess: () => { toast.success("优先级已更新"); qc.invalidateQueries({ queryKey: ["admin-model-services"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>模型服务管理</h2>
        <HelpIcon text="model_service" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索模型名..." value={keyword} onChange={e => setKeyword(e.target.value)} />
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={vendorId} onChange={e => setVendorId(e.target.value)}>
          <option value="">全部供应商</option>
          <option value="1">DeepSeek</option>
          <option value="2">OpenAI</option>
          <option value="3">GLM</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🎛️ 模型服务列表 <HelpIcon text="model_service" /></div>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>显示名</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>上游模型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>成本(输入/输出)</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>优先级</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(listQ.data?.list ?? []).map((m: any) => (
                <tr key={m.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{m.display_name ?? m.model_name}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{m.upstream_model}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{m.vendor_name ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>¥{m.cost_input_price} / ¥{m.cost_output_price}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <input type="number" defaultValue={m.priority} style={{ width: 50, padding: 4 }}
                      onBlur={e => priorityMut.mutate({ id: m.id, priority: Number(e.target.value) })} />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={m.is_enabled ? "success" : "default"}>{m.is_enabled ? "启用" : "禁用"}</StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <ConfirmPopover title={m.is_enabled ? "禁用该模型服务？" : "启用该模型服务？"}
                      onConfirm={() => toggleMut.mutate({ id: m.id, enabled: !m.is_enabled })}>
                      <button style={{ ...btnBase, background: m.is_enabled ? "#f0f0f0" : "#4f6ef7", color: m.is_enabled ? "#333" : "#fff", fontSize: 12 }}>
                        {m.is_enabled ? "禁用" : "启用"}
                      </button>
                    </ConfirmPopover>
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

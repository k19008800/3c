import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vendorApi } from "../../lib/vendor-api";

interface VendorModel {
  id: number; model_id: number; model_name: string; display_name: string | null; category: string | null;
  upstream_model: string; cost_input_price: string; cost_output_price: string; weight: number; priority: number;
  is_enabled: boolean; health_score: number | null;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

export default function VendorModelsPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ model_id: "", upstream_model: "", cost_input_price: "0", cost_output_price: "0" });
  const [edit, setEdit] = useState<VendorModel | null>(null);
  const [editForm, setEditForm] = useState({ cost_input_price: "0", cost_output_price: "0", weight: "1" });
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["vendor-models"],
    queryFn: async () => (await vendorApi.get<{ list: VendorModel[] }>("/vendor/models")).list,
  });

  const addMut = useMutation({
    mutationFn: async () => vendorApi.post("/vendor/models", { model_id: Number(addForm.model_id), upstream_model: addForm.upstream_model, cost_input_price: Number(addForm.cost_input_price), cost_output_price: Number(addForm.cost_output_price) }),
    onSuccess: () => { setNotice({ type: "success", msg: "模型已添加" }); setAddOpen(false); setAddForm({ model_id: "", upstream_model: "", cost_input_price: "0", cost_output_price: "0" }); qc.invalidateQueries({ queryKey: ["vendor-models"] }); },
    onError: (e: any) => setNotice({ type: "error", msg: e?.message ?? "添加失败" }),
  });
  const editMut = useMutation({
    mutationFn: async () => vendorApi.put(`/vendor/models/${edit!.id}`, { cost_input_price: Number(editForm.cost_input_price), cost_output_price: Number(editForm.cost_output_price), weight: Number(editForm.weight) }),
    onSuccess: () => { setNotice({ type: "success", msg: "模型已更新" }); setEdit(null); qc.invalidateQueries({ queryKey: ["vendor-models"] }); },
    onError: (e: any) => setNotice({ type: "error", msg: e?.message ?? "更新失败" }),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>模型管理</h2>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setAddOpen(true)} style={{ ...btnBase, background: "#0ea5e9", color: "#fff" }}>+ 新增模型</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.length ?? 0) === 0 ? <div style={{ color: "#94a3b8", padding: 30, textAlign: "center" }}>暂无关联模型</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "8px" }}>平台模型</th><th style={{ padding: "8px" }}>供应商模型名</th><th style={{ padding: "8px" }}>输入价</th><th style={{ padding: "8px" }}>输出价</th><th style={{ padding: "8px" }}>权重</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>操作</th></tr></thead>
            <tbody>
              {listQ.data?.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{m.model_name}{m.display_name ? ` (${m.display_name})` : ""}</td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{m.upstream_model}</td>
                  <td style={{ padding: "8px" }}>¥{Number(m.cost_input_price).toFixed(6)}</td>
                  <td style={{ padding: "8px" }}>¥{Number(m.cost_output_price).toFixed(6)}</td>
                  <td style={{ padding: "8px" }}>{m.weight}</td>
                  <td style={{ padding: "8px" }}><span style={{ padding: "2px 10px", borderRadius: 6, fontSize: 12, background: m.is_enabled ? "#dcfce7" : "#f1f5f9", color: m.is_enabled ? "#166534" : "#94a3b8" }}>{m.is_enabled ? "启用" : "停用"}</span></td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => { setEdit(m); setEditForm({ cost_input_price: String(Number(m.cost_input_price)), cost_output_price: String(Number(m.cost_output_price)), weight: String(m.weight) }); }} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 新增模型弹窗 —— 简单模式：手动填平台模型 id */}
      {addOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 420 }}>
            <h3 style={{ marginBottom: 16 }}>新增模型</h3>
            <input value={addForm.model_id} onChange={(e) => setAddForm({ ...addForm, model_id: e.target.value })} placeholder="平台模型 ID（如 deepseek-chat=5）" type="number" style={inp} />
            <input value={addForm.upstream_model} onChange={(e) => setAddForm({ ...addForm, upstream_model: e.target.value })} placeholder="供应商侧模型名（路由映射用）*" style={inp} />
            <input value={addForm.cost_input_price} onChange={(e) => setAddForm({ ...addForm, cost_input_price: e.target.value })} placeholder="输入价格 ¥/1K tokens" type="number" step="0.000001" style={inp} />
            <input value={addForm.cost_output_price} onChange={(e) => setAddForm({ ...addForm, cost_output_price: e.target.value })} placeholder="输出价格 ¥/1K tokens" type="number" step="0.000001" style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAddOpen(false)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => addMut.mutate()} disabled={!addForm.upstream_model || !addForm.model_id} style={{ ...btnBase, background: "#0ea5e9", color: "#fff" }}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {edit && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 420 }}>
            <h3 style={{ marginBottom: 16 }}>编辑模型 · {edit.model_name}</h3>
            <input value={editForm.cost_input_price} onChange={(e) => setEditForm({ ...editForm, cost_input_price: e.target.value })} placeholder="输入价格" type="number" step="0.000001" style={inp} />
            <input value={editForm.cost_output_price} onChange={(e) => setEditForm({ ...editForm, cost_output_price: e.target.value })} placeholder="输出价格" type="number" step="0.000001" style={inp} />
            <input value={editForm.weight} onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })} placeholder="路由权重" type="number" style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEdit(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => editMut.mutate()} style={{ ...btnBase, background: "#0ea5e9", color: "#fff" }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

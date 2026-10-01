import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vendorApi } from "../../lib/vendor-api";
import "../console-misc.css";

interface VendorModel {
  id: number; model_id: number; model_name: string; display_name: string | null; category: string | null;
  upstream_model: string; cost_input_price: string; cost_output_price: string; weight: number; priority: number;
  is_enabled: boolean; health_score: number | null;
}

const card = { background: "var(--color-panel)", border: "1px solid var(--color-divider)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: "var(--radius-md)", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

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
    <div>
      <h2 style={{ marginBottom: 20, color: "var(--color-text)" }}>模型管理</h2>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setAddOpen(true)} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>+ 新增模型</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "var(--color-text-muted)" }}>加载中...</div> : (listQ.data?.length ?? 0) === 0 ? <div style={{ color: "var(--color-text-muted)", padding: 30, textAlign: "center" }}>暂无关联模型</div> : (
          <table className="cm-table">
            <thead><tr><th>平台模型</th><th>供应商模型名</th><th className="num">输入价</th><th className="num">输出价</th><th className="num">权重</th><th style={{textAlign:"center"}}>状态</th><th>操作</th></tr></thead>
            <tbody>
              {listQ.data?.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.model_name}{m.display_name ? ` (${m.display_name})` : ""}</td>
                  <td style={{ fontFamily: "var(--font-family-mono)", fontSize: 12 }}>{m.upstream_model}</td>
                  <td className="num">¥{Number(m.cost_input_price).toFixed(6)}</td>
                  <td className="num">¥{Number(m.cost_output_price).toFixed(6)}</td>
                  <td className="num">{m.weight}</td>
                  <td style={{ textAlign: "center" }}><span style={{ padding: "2px 10px", borderRadius: "var(--radius-pill)", fontSize: 12, background: m.is_enabled ? "var(--color-success-bg)" : "var(--color-disabled-bg)", color: m.is_enabled ? "var(--color-success-text)" : "var(--color-text-muted)" }}>{m.is_enabled ? "启用" : "停用"}</span></td>
                  <td>
                    <button onClick={() => { setEdit(m); setEditForm({ cost_input_price: String(Number(m.cost_input_price)), cost_output_price: String(Number(m.cost_output_price)), weight: String(m.weight) }); }} style={{ ...btnBase, background: "var(--color-divider-light)", color: "var(--color-text)", padding: "4px 10px" }}>编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 新增模型弹窗 —— 简单模式：手动填平台模型 id */}
      {addOpen && (
        <div style={{ position: "fixed", inset: 0, background: "var(--color-modal-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "var(--z-modal)" }}>
          <div style={{ ...card, width: 420, maxWidth: "calc(100vw - 40px)" }}>
            <h3 style={{ marginBottom: 16, color: "var(--color-text)" }}>新增模型</h3>
            <input value={addForm.model_id} onChange={(e) => setAddForm({ ...addForm, model_id: e.target.value })} placeholder="平台模型 ID（如 deepseek-chat=5）" type="number" style={inp} />
            <input value={addForm.upstream_model} onChange={(e) => setAddForm({ ...addForm, upstream_model: e.target.value })} placeholder="供应商侧模型名（路由映射用）*" style={inp} />
            <input value={addForm.cost_input_price} onChange={(e) => setAddForm({ ...addForm, cost_input_price: e.target.value })} placeholder="输入价格 ¥/1K tokens" type="number" step="0.000001" style={inp} />
            <input value={addForm.cost_output_price} onChange={(e) => setAddForm({ ...addForm, cost_output_price: e.target.value })} placeholder="输出价格 ¥/1K tokens" type="number" step="0.000001" style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAddOpen(false)} style={{ ...btnBase, background: "var(--color-divider-light)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => addMut.mutate()} disabled={!addForm.upstream_model || !addForm.model_id} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {edit && (
        <div style={{ position: "fixed", inset: 0, background: "var(--color-modal-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "var(--z-modal)" }}>
          <div style={{ ...card, width: 420, maxWidth: "calc(100vw - 40px)" }}>
            <h3 style={{ marginBottom: 16, color: "var(--color-text)" }}>编辑模型 · {edit.model_name}</h3>
            <input value={editForm.cost_input_price} onChange={(e) => setEditForm({ ...editForm, cost_input_price: e.target.value })} placeholder="输入价格" type="number" step="0.000001" style={inp} />
            <input value={editForm.cost_output_price} onChange={(e) => setEditForm({ ...editForm, cost_output_price: e.target.value })} placeholder="输出价格" type="number" step="0.000001" style={inp} />
            <input value={editForm.weight} onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })} placeholder="路由权重" type="number" style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEdit(null)} style={{ ...btnBase, background: "var(--color-divider-light)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => editMut.mutate()} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: "var(--z-toast)", padding: "12px 20px", borderRadius: "var(--radius-md)", color: "#fff", background: notice.type === "success" ? "var(--color-success-text)" : "var(--color-danger-text)", boxShadow: "var(--shadow-toast)" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

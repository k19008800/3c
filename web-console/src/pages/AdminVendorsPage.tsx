import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/* ============ 类型 ============ */
interface Vendor {
  id: number;
  name: string;
  code: string;
  status: string;
  status_label: string;
  base_url: string;
  api_format: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  model_count: number;
}
interface VendorModel {
  id: number;
  model_id: number;
  model_name: string;
  display_name: string;
  upstream_model: string;
  cost_input_price: number;
  cost_output_price: number;
  weight: number;
  priority: number;
  is_enabled: boolean;
  health_score: number;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active: { bg: "#dcfce7", color: "#166534" },
  maintenance: { bg: "#fef3c7", color: "#92400e" },
  offline: { bg: "#fee2e2", color: "#991b1b" },
};
const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10 };

export default function AdminVendorsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<Vendor | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", base_url: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [vmForm, setVmForm] = useState<VendorModel | null>(null);
  const [showVmModal, setShowVmModal] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-vendors", status, keyword],
    queryFn: async () =>
      (await api.get<{ data: { list: Vendor[]; pagination: { total: number } } }>(`/admin/vendors?status=${status}&keyword=${keyword}&page_size=50`)).data
        .data,
  });

  const detailQ = useQuery({
    queryKey: ["admin-vendor-detail", detail?.id],
    queryFn: async () => (await api.get<{ data: { vendor: Vendor; models: VendorModel[] } }>(`/admin/vendors/${detail!.id}`)).data.data,
    enabled: !!detail?.id,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post("/admin/vendors", createForm)).data,
    onSuccess: () => { setNotice({ type: "success", msg: "供应商已创建" }); setShowCreate(false); setCreateForm({ name: "", base_url: "" }); qc.invalidateQueries({ queryKey: ["admin-vendors"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => (await api.post(`/admin/vendors/${id}/toggle-status`, { status })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "状态已切换" }); qc.invalidateQueries({ queryKey: ["admin-vendors"] }); qc.invalidateQueries({ queryKey: ["admin-vendor-detail"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const vmAddMut = useMutation({
    mutationFn: async (body: any) => (await api.post(`/admin/vendors/${detail!.id}/models`, body)).data,
    onSuccess: () => { setNotice({ type: "success", msg: "映射已添加" }); setShowVmModal(false); qc.invalidateQueries({ queryKey: ["admin-vendor-detail"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const vmEditMut = useMutation({
    mutationFn: async ({ id, body }: any) => (await api.put(`/admin/vendor-models/${id}`, body)).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "映射已更新" }); setShowVmModal(false); qc.invalidateQueries({ queryKey: ["admin-vendor-detail"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const vmDelMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/vendor-models/${id}`)).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "映射已下线" }); qc.invalidateQueries({ queryKey: ["admin-vendor-detail"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  // ===== Key 资源池 =====
  const vendorKeysQ = useQuery({
    queryKey: ["admin-vendor-keys", detail?.id],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/vendors/${detail!.id}/keys`)).data.data,
    enabled: !!detail?.id,
  });
  const addKeyMut = useMutation({
    mutationFn: async ({ vendorId, api_key }: { vendorId: number; api_key: string }) => (await api.post(`/admin/vendors/${vendorId}/keys`, { api_key })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "Key 已添加" }); setNewKeyInput(""); qc.invalidateQueries({ queryKey: ["admin-vendor-keys"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const toggleKeyMut = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: number; is_enabled: boolean }) => (await api.post(`/admin/vendor-keys/${id}/toggle`, { is_enabled })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-vendor-keys"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const delKeyMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/vendor-keys/${id}`)).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "Key 已删除" }); qc.invalidateQueries({ queryKey: ["admin-vendor-keys"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const searchSubmit = () => { setKeyword(search); setStatus(status); };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>供应商管理</h2>

      {/* 筛选 + 新建 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchSubmit()} placeholder="搜索供应商" style={{ ...inputStyle, width: 200, marginBottom: 0 }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); }} style={{ ...inputStyle, width: 130, marginBottom: 0 }}>
          <option value="">全部状态</option>
          <option value="active">运行中</option>
          <option value="maintenance">维护中</option>
          <option value="offline">已下线</option>
        </select>
        <button onClick={searchSubmit} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>搜索</button>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b" }}>共 {listQ.data?.pagination?.total ?? 0} 条</span>
        <button onClick={() => setShowCreate(true)} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>+ 新增供应商</button>
      </div>

      {/* 列表 */}
      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无供应商</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>名称</th>
                <th style={{ padding: "8px" }}>编码</th>
                <th style={{ padding: "8px" }}>API格式</th>
                <th style={{ padding: "8px" }}>模型数</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>创建时间</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.list.map((v) => (
                <tr key={v.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{v.name}</td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{v.code}</td>
                  <td style={{ padding: "8px", color: "#64748b" }}>{v.api_format}</td>
                  <td style={{ padding: "8px" }}>{v.model_count}</td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ ...(STATUS_STYLE[v.status] ?? STATUS_STYLE.active), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{v.status_label}</span>
                  </td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{new Date(v.created_at).toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setDetail(v)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>管理</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 新建供应商弹窗 */}
      {showCreate && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 400 }}>
            <h3 style={{ marginBottom: 16 }}>新增供应商</h3>
            <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="供应商名称 *" style={inputStyle} />
            <input value={createForm.base_url} onChange={(e) => setCreateForm({ ...createForm, base_url: e.target.value })} placeholder="API 地址 (https://...)" style={inputStyle} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCreate(false)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !createForm.name.trim()} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>
                {createMut.isPending ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 供应商详情弹窗（含模型映射管理） */}
      {detail && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 760, maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>{detail.name}</h3>
              <span style={{ ...(STATUS_STYLE[detail.status] ?? STATUS_STYLE.active), padding: "2px 10px", borderRadius: 6, fontSize: 12, marginLeft: 12 }}>{detail.status_label}</span>
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.8 }}>
              <div>编码: <strong>{detail.code}</strong> | API 地址: <strong style={{ fontFamily: "monospace" }}>{detail.base_url}</strong> | 格式: <strong>{detail.api_format}</strong></div>
            </div>

            {/* 状态切换 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["active", "maintenance", "offline"].filter(s => s !== detail.status).map((s) => (
                <button key={s} onClick={() => toggleMut.mutate({ id: detail.id, status: s })} disabled={toggleMut.isPending} style={{ ...btnBase, background: s === "offline" ? "#dc2626" : s === "maintenance" ? "#d97706" : "#16a34a", color: "#fff" }}>
                  {s === "active" ? "恢复运行" : s === "maintenance" ? "设为维护" : "下线"}
                </button>
              ))}
            </div>

            <h4 style={{ margin: "16px 0 12px" }}>模型映射（{detailQ.data?.models?.length ?? 0}）</h4>
            <button onClick={() => { setVmForm({ id: 0, model_id: 0, model_name: "", display_name: "", upstream_model: "", cost_input_price: 0, cost_output_price: 0, weight: 10, priority: 0, is_enabled: true, health_score: 100 }); setShowVmModal(true); }} style={{ ...btnBase, background: "#16a34a", color: "#fff", marginBottom: 12 }}>+ 添加映射</button>
            {detailQ.data?.models?.length ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: "6px" }}>模型</th>
                    <th style={{ padding: "6px" }}>上游名</th>
                    <th style={{ padding: "6px" }}>成本价(入/出)</th>
                    <th style={{ padding: "6px" }}>权重/优先级</th>
                    <th style={{ padding: "6px" }}>启用</th>
                    <th style={{ padding: "6px" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {detailQ.data?.models.map((m) => (
                    <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px", fontWeight: 600 }}>{m.model_name}</td>
                      <td style={{ padding: "6px", fontFamily: "monospace", fontSize: 12 }}>{m.upstream_model}</td>
                      <td style={{ padding: "6px" }}>¥{m.cost_input_price}/{m.cost_output_price}</td>
                      <td style={{ padding: "6px" }}>{m.weight}/{m.priority}</td>
                      <td style={{ padding: "6px" }}>{m.is_enabled ? <span style={{ color: "#16a34a" }}>✓</span> : <span style={{ color: "#94a3b8" }}>✗</span>}</td>
                      <td style={{ padding: "6px" }}>
                        <button onClick={() => { setVmForm({ ...m }); setShowVmModal(true); }} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>编辑</button>
                        <button onClick={() => vmDelMut.mutate(m.id)} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b", padding: "4px 10px", marginLeft: 6 }}>下线</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>尚未配置模型映射</div>
            )}

            {/* Key 资源池 */}
            <h4 style={{ margin: "20px 0 12px" }}>Key 资源池</h4>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={newKeyInput} onChange={(e) => setNewKeyInput(e.target.value)} placeholder="粘贴供应商 API Key" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", flex: 1, fontFamily: "monospace", fontSize: 13 }} />
              <button onClick={() => addKeyMut.mutate({ vendorId: detail.id, api_key: newKeyInput })} disabled={addKeyMut.isPending || !newKeyInput.trim()} style={{ ...btnBase, background: "#16a34a", color: "#fff", whiteSpace: "nowrap" }}>
                {addKeyMut.isPending ? "添加中..." : "+ 添加 Key"}
              </button>
            </div>
            {(vendorKeysQ.data?.list?.length ?? 0) > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: "6px" }}>Key 前缀</th>
                    <th style={{ padding: "6px" }}>状态</th>
                    <th style={{ padding: "6px" }}>失败数</th>
                    <th style={{ padding: "6px" }}>最近使用</th>
                    <th style={{ padding: "6px" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(vendorKeysQ.data?.list ?? []).map((k: any) => (
                    <tr key={k.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px", fontFamily: "monospace", fontSize: 12 }}>{k.key_prefix}</td>
                      <td style={{ padding: "6px" }}>
                        <span style={{ background: k.is_enabled ? "#dcfce7" : "#fee2e2", color: k.is_enabled ? "#166534" : "#991b1b", padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>
                          {k.is_enabled ? "启用" : "停用"}
                        </span>
                      </td>
                      <td style={{ padding: "6px" }}>{k.failed_count ?? 0}</td>
                      <td style={{ padding: "6px", color: "#64748b" }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "-"}</td>
                      <td style={{ padding: "6px" }}>
                        <button onClick={() => toggleKeyMut.mutate({ id: k.id, is_enabled: !k.is_enabled })} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>{k.is_enabled ? "停用" : "启用"}</button>
                        <button onClick={() => delKeyMut.mutate(k.id)} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b", padding: "4px 10px", marginLeft: 6 }}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>尚未配置供应商 Key</div>
            )}

            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button onClick={() => setDetail(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 映射编辑弹窗 */}
      {showVmModal && vmForm && (
        <VmModal
          form={vmForm}
          onClose={() => setShowVmModal(false)}
          onSave={(body) => vmForm.id ? vmEditMut.mutate({ id: vmForm.id, body }) : vmAddMut.mutate(body)}
        />
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1200, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}
          <button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

/* 映射表单子组件 */
function VmModal({ form, onClose, onSave }: { form: any; onClose: () => void; onSave: (body: any) => void }) {
  const [f, setF] = useState({ ...form });
  const d = { ...f };
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const save = () => {
    if (!f.model_id) { alert("请选择模型 ID"); return; }
    onSave({
      model_id: Number(f.model_id),
      upstream_model: f.upstream_model,
      cost_input_price: Number(f.cost_input_price),
      cost_output_price: Number(f.cost_output_price),
      weight: Number(f.weight),
      priority: Number(f.priority),
      is_enabled: !!f.is_enabled,
    });
  };
  const inputStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 8, fontSize: 13 };
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
      <div style={{ ...card, width: 480 }}>
        <h3 style={{ marginBottom: 16 }}>{form.id ? "编辑映射" : "添加映射"}</h3>
        <input value={f.model_id || ""} onChange={(e) => set("model_id", e.target.value)} placeholder="模型 ID *" type="number" style={inputStyle} />
        <input value={f.upstream_model} onChange={(e) => set("upstream_model", e.target.value)} placeholder="上游模型名 *" style={inputStyle} />
        <div style={grid}>
          <input value={f.cost_input_price} onChange={(e) => set("cost_input_price", e.target.value)} placeholder="成本价·输入" type="number" step="0.000001" style={inputStyle} />
          <input value={f.cost_output_price} onChange={(e) => set("cost_output_price", e.target.value)} placeholder="成本价·输出" type="number" step="0.000001" style={inputStyle} />
        </div>
        <div style={grid}>
          <input value={f.weight} onChange={(e) => set("weight", e.target.value)} placeholder="权重" type="number" style={inputStyle} />
          <input value={f.priority} onChange={(e) => set("priority", e.target.value)} placeholder="优先级" type="number" style={inputStyle} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}>
          <input type="checkbox" checked={!!f.is_enabled} onChange={(e) => set("is_enabled", e.target.checked)} /> 启用该映射
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
          <button onClick={save} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>保存</button>
        </div>
      </div>
    </div>
  );
}

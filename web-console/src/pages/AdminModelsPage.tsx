import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface M {
  id: number;
  name: string;
  display_name: string;
  category: string;
  context_length: number;
  description: string;
  status: string;
  vendor_count: number;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10 };

const CATEGORIES = ["chat", "embedding", "image", "audio", "rerank", "video", "moderation", "realtime"];

export default function AdminModelsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editForm, setEditForm] = useState<M | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", display_name: "", category: "chat" });
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-models", keyword],
    queryFn: async () =>
      (await api.get<{ data: { list: M[]; pagination: { total: number } } }>(`/admin/models?keyword=${keyword}&page_size=50`)).data.data,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post("/admin/models", createForm)).data,
    onSuccess: () => { setNotice({ type: "success", msg: "模型已创建" }); setShowCreate(false); setCreateForm({ name: "", display_name: "", category: "chat" }); qc.invalidateQueries({ queryKey: ["admin-models"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const editMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => (await api.put(`/admin/models/${id}`, body)).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "模型已更新" }); setEditForm(null); qc.invalidateQueries({ queryKey: ["admin-models"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => (await api.put(`/admin/models/${id}`, { status })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已更新" }); qc.invalidateQueries({ queryKey: ["admin-models"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>模型管理</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setKeyword(search)} placeholder="搜索模型名/显示名" style={{ ...inputStyle, width: 240, marginBottom: 0 }} />
        <button onClick={() => setKeyword(search)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>搜索</button>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b" }}>共 {listQ.data?.pagination?.total ?? 0} 种模型</span>
        <button onClick={() => setShowCreate(true)} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>+ 新增模型</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无模型</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>模型名</th>
                <th style={{ padding: "8px" }}>显示名</th>
                <th style={{ padding: "8px" }}>类型</th>
                <th style={{ padding: "8px" }}>上下文</th>
                <th style={{ padding: "8px" }}>接入供应商</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.list.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600, fontFamily: "monospace", fontSize: 13 }}>{m.name}</td>
                  <td style={{ padding: "8px" }}>{m.display_name}</td>
                  <td style={{ padding: "8px", color: "#64748b" }}>{m.category}</td>
                  <td style={{ padding: "8px", color: "#64748b" }}>{m.context_length ? `${m.context_length}K` : "-"}</td>
                  <td style={{ padding: "8px" }}>{m.vendor_count}</td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ background: m.status === "active" ? "#dcfce7" : "#fee2e2", color: m.status === "active" ? "#166534" : "#991b1b", padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>
                      {m.status === "active" ? "已上架" : "已下线"}
                    </span>
                  </td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setEditForm(m)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>编辑</button>
                    <button onClick={() => toggleMut.mutate({ id: m.id, status: m.status === "active" ? "offline" : "active" })} style={{ ...btnBase, background: m.status === "active" ? "#fee2e2" : "#dcfce7", color: m.status === "active" ? "#991b1b" : "#166534", padding: "4px 10px", marginLeft: 6 }}>
                      {m.status === "active" ? "下线" : "上架"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 新建模型 */}
      {showCreate && (
        <Modal title="新增模型" onClose={() => setShowCreate(false)}>
          <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="模型名 (如 deepseek-chat) *" style={inputStyle} />
          <input value={createForm.display_name} onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })} placeholder="显示名" style={inputStyle} />
          <select value={createForm.category} onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })} style={inputStyle}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowCreate(false)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !createForm.name.trim()} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>
              {createMut.isPending ? "创建中..." : "创建"}
            </button>
          </div>
        </Modal>
      )}

      {/* 编辑模型 */}
      {editForm && (
        <Modal title={`编辑模型 · ${editForm.name}`} onClose={() => setEditForm(null)}>
          <EditForm model={editForm} onSave={(body) => editMut.mutate({ id: editForm.id, body })} onCancel={() => setEditForm(null)} />
        </Modal>
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

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ ...card, width: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function EditForm({ model, onSave, onCancel }: { model: M; onSave: (body: any) => void; onCancel: () => void }) {
  const [display, setDisplay] = useState(model.display_name);
  const [category, setCategory] = useState(model.category);
  const [ctx, setCtx] = useState(String(model.context_length ?? 0));
  const [desc, setDesc] = useState(model.description ?? "");
  const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10 };
  return (
    <div>
      <input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="显示名" style={inputStyle} />
      <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input value={ctx} onChange={(e) => setCtx(e.target.value)} placeholder="上下文长度 (K)" type="number" style={inputStyle} />
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="描述" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
        <button onClick={() => onSave({ display_name: display, category, context_length: Number(ctx), description: desc })} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>保存</button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface Batch {
  id: number;
  name: string;
  amount: number;
  total_count: number;
  used_count: number;
  status: string;
  status_label: string;
  note: string | null;
  created_at: string;
  expires_at: string | null;
}
interface CodeItem { id: number; code: string; status: string; used_by_email: string | null; used_at: string | null; }

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminRedemptionPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", total_count: "10", expires_at: "", note: "" });
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-redemption"],
    queryFn: async () => (await api.get<{ data: { list: Batch[] } }>("/admin/redemption/batches")).data.data,
  });
  const detailQ = useQuery({
    queryKey: ["admin-redemption-detail", detailId],
    queryFn: async () => (await api.get<{ data: { batch: Batch; codes: CodeItem[] } }>(`/admin/redemption/batches/${detailId}`)).data.data,
    enabled: !!detailId,
  });
  const createMut = useMutation({
    mutationFn: async () => (await api.post("/admin/redemption/batches", { ...form, amount: Number(form.amount), total_count: Number(form.total_count), expires_at: form.expires_at || undefined })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "批次已创建" }); setShowCreate(false); setForm({ name: "", amount: "", total_count: "10", expires_at: "", note: "" }); qc.invalidateQueries({ queryKey: ["admin-redemption"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => (await api.post(`/admin/redemption/batches/${id}/toggle`, { status })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-redemption"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>兑换码批次</h2>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setShowCreate(true)} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>+ 新建批次</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无批次</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>批次名</th>
                <th style={{ padding: "8px" }}>面额</th>
                <th style={{ padding: "8px" }}>数量</th>
                <th style={{ padding: "8px" }}>已用</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>过期</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.list.map((b) => (
                <tr key={b.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{b.name}</td>
                  <td style={{ padding: "8px" }}>¥{b.amount.toFixed(2)}</td>
                  <td style={{ padding: "8px" }}>{b.total_count}</td>
                  <td style={{ padding: "8px" }}>{b.used_count}</td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ background: b.status === "active" ? "#dcfce7" : "#f1f5f9", color: b.status === "active" ? "#166534" : "#475569", padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{b.status_label}</span>
                  </td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{b.expires_at ? new Date(b.expires_at).toLocaleDateString() : "永久"}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setDetailId(b.id)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>查看</button>
                    <button onClick={() => toggleMut.mutate({ id: b.id, status: b.status === "active" ? "disabled" : "active" })} style={{ ...btnBase, background: b.status === "active" ? "#fee2e2" : "#dcfce7", color: b.status === "active" ? "#991b1b" : "#166534", padding: "4px 10px", marginLeft: 6 }}>{b.status === "active" ? "停用" : "启用"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 新建批次弹窗 */}
      {showCreate && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 440 }}>
            <h3 style={{ marginBottom: 16 }}>新建兑换码批次</h3>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="批次名称 *" style={inp} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="单码面额(元) *" type="number" style={inp} />
              <input value={form.total_count} onChange={(e) => setForm({ ...form, total_count: e.target.value })} placeholder="生成数量 *" type="number" style={inp} />
            </div>
            <input value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} placeholder="过期时间(留空永久)" type="datetime-local" style={inp} />
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="备注" rows={2} style={{ ...inp, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCreate(false)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name || !form.amount} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>{createMut.isPending ? "创建中..." : "创建并生成"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 批次详情弹窗（码列表） */}
      {detailId && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 640, maxHeight: "80vh", overflow: "auto" }}>
            <h3 style={{ marginBottom: 16 }}>{detailQ.data?.batch?.name} · 兑换码列表</h3>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>共 {detailQ.data?.codes?.length} 个码，已用 {detailQ.data?.batch?.used_count}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {detailQ.data?.codes?.map((c) => (
                <div key={c.id} style={{ padding: "6px 10px", borderRadius: 6, background: c.status === "used" ? "#f1f5f9" : "#f8fafc", display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: 12 }}>
                  <span>{c.code}</span>
                  <span style={{ color: c.status === "used" ? "#991b1b" : "#16a34a" }}>{c.status === "used" ? "已用" : "未用"}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button onClick={() => setDetailId(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button>
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

const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

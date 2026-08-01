import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface Ann {
  id: number;
  title: string;
  content: string;
  type: string;
  type_label: string;
  status: boolean;
  priority: number;
  read_count: number;
  created_by_email: string;
  created_at: string;
}
interface Reader { id: number; email: string; username: string; read_at: string; }

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

export default function AdminAnnouncementsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<{ id?: number | null; title: string; content: string; type: string; priority: number; publish: boolean } | null>(null);
  const [readers, setReaders] = useState<Reader[] | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-announcements", status],
    queryFn: async () => (await api.get<{ data: { list: Ann[] } }>(`/admin/announcements?status=${status}`)).data.data,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { title: editor!.title, content: editor!.content, type: editor!.type, priority: editor!.priority, publish: editor!.publish };
      return editor!.id != null ? (await api.put(`/admin/announcements/${editor!.id}`, body)).data : (await api.post("/admin/announcements", body)).data;
    },
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已保存" }); setEditor(null); qc.invalidateQueries({ queryKey: ["admin-announcements"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const delMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/announcements/${id}`)).data,
    onSuccess: () => { setNotice({ type: "success", msg: "已删除" }); qc.invalidateQueries({ queryKey: ["admin-announcements"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const viewReaders = async (id: number) => {
    try { const d = (await api.get<{ data: { readers: Reader[] } }>(`/admin/announcements/${id}/readers`)).data.data; setReaders(d.readers); } catch (e) { setNotice({ type: "error", msg: extractError(e) }); }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>公告管理</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[{ value: "", label: "全部" }, { value: "published", label: "已发布" }, { value: "draft", label: "草稿" }].map(f => (
          <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "#2563eb" : "#fff", color: status === f.value ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>{f.label}</button>
        ))}
        <button onClick={() => setEditor({ id: null, title: "", content: "", type: "system_announcement", priority: 0, publish: true })} style={{ ...btnBase, background: "#2563eb", color: "#fff", marginLeft: "auto" }}>+ 新建公告</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无公告</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>标题</th>
                <th style={{ padding: "8px" }}>类型</th>
                <th style={{ padding: "8px" }}>优先级</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>已读</th>
                <th style={{ padding: "8px" }}>创建人</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.list.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{a.title}</td>
                  <td style={{ padding: "8px" }}>{a.type_label}</td>
                  <td style={{ padding: "8px" }}>{a.priority}</td>
                  <td style={{ padding: "8px" }}><span style={{ background: a.status ? "#dcfce7" : "#f1f5f9", color: a.status ? "#166534" : "#475569", padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{a.status ? "已发布" : "草稿"}</span></td>
                  <td style={{ padding: "8px" }}>{a.read_count}</td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{a.created_by_email ?? "-"}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setEditor({ id: a.id, title: a.title, content: a.content, type: a.type, priority: a.priority, publish: a.status })} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>编辑</button>
                    <button onClick={() => viewReaders(a.id)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px", marginLeft: 6 }}>阅读</button>
                    <button onClick={() => delMut.mutate(a.id)} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b", padding: "4px 10px", marginLeft: 6 }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 编辑弹窗 */}
      {editor && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 560 }}>
            <h3 style={{ marginBottom: 16 }}>{editor.id != null ? "编辑公告" : "新建公告"}</h3>
            <input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="标题 *" style={inp} />
            <select value={editor.type} onChange={(e) => setEditor({ ...editor, type: e.target.value })} style={inp}>
              <option value="system_announcement">系统公告</option>
              <option value="maintenance">维护通知</option>
              <option value="activity">活动通知</option>
              <option value="security">安全告警</option>
            </select>
            <input value={editor.priority} onChange={(e) => setEditor({ ...editor, priority: Number(e.target.value) })} placeholder="优先级(越大越靠前)" type="number" style={inp} />
            <textarea value={editor.content} onChange={(e) => setEditor({ ...editor, content: e.target.value })} placeholder="内容 *" rows={5} style={{ ...inp, resize: "vertical" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}>
              <input type="checkbox" checked={editor.publish} onChange={(e) => setEditor({ ...editor, publish: e.target.checked })} /> 立即发布（否则保存为草稿）
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditor(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !editor.title || !editor.content} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>{saveMut.isPending ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 阅读统计弹窗 */}
      {readers && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 480, maxHeight: "70vh", overflow: "auto" }}>
            <h3 style={{ marginBottom: 16 }}>已读用户（{readers.length}）</h3>
            {readers.length === 0 ? <div style={{ color: "#94a3b8" }}>暂无用户阅读</div> : readers.map(r => (
              <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between" }}>
                <span>{r.email}</span><span style={{ color: "#94a3b8", fontSize: 12 }}>{new Date(r.read_at).toLocaleString()}</span>
              </div>
            ))}
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button onClick={() => setReaders(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button>
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

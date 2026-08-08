import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast, ConfirmPopover } from "@3cloud/shared-ui";

interface Ann {
  id: number; title: string; content: string; type: string; type_label: string;
  status: boolean; priority: number; read_count: number;
  created_by_email: string; created_at: string;
}
interface Reader { id: number; email: string; username: string; read_at: string; }

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

export default function AdminAnnouncementsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<{ id?: number | null; title: string; content: string; type: string; priority: number; publish: boolean } | null>(null);
  const [readers, setReaders] = useState<Reader[] | null>(null);
  const { toast } = useToast();

  const listQ = useQuery({
    queryKey: ["admin-announcements", status],
    queryFn: async () => (await api.get<{ data: { list: Ann[] } }>(`/admin/announcements?status=${status}`)).data.data,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { title: editor!.title, content: editor!.content, type: editor!.type, priority: editor!.priority, publish: editor!.publish };
      return editor!.id != null ? (await api.put(`/admin/announcements/${editor!.id}`, body)).data : (await api.post("/admin/announcements", body)).data;
    },
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已保存"); setEditor(null); qc.invalidateQueries({ queryKey: ["admin-announcements"] }); },
    onError: (e) => toast.error(extractError(e)),
  });
  const delMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/announcements/${id}`)).data,
    onSuccess: () => { toast.success("已删除"); qc.invalidateQueries({ queryKey: ["admin-announcements"] }); },
    onError: (e) => toast.error(extractError(e)),
  });
  const viewReaders = async (id: number) => {
    try { const d = (await api.get<{ data: { readers: Reader[] } }>(`/admin/announcements/${id}/readers`)).data.data; setReaders(d.readers); } catch (e) { toast.error(extractError(e)); }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        公告管理
        <HelpIcon text="管理平台公告。创建/编辑公告，支持立即发布或保存为草稿。可查看公告的阅读统计。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[{ value: "", label: "全部" }, { value: "published", label: "已发布" }, { value: "draft", label: "草稿" }].map(f => (
          <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "var(--color-primary)" : "var(--color-panel)", color: status === f.value ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>{f.label}</button>
        ))}
        <button onClick={() => setEditor({ id: null, title: "", content: "", type: "system_announcement", priority: 0, publish: true })} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", marginLeft: "auto" }}>+ 新建公告</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (listQ.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无公告" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>标题</th><th style={{ padding: "8px" }}>类型</th><th style={{ padding: "8px" }}>优先级</th>
                <th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>已读</th><th style={{ padding: "8px" }}>创建人</th><th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.list.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{a.title}</td>
                  <td style={{ padding: "8px" }}>{a.type_label}</td>
                  <td style={{ padding: "8px" }}>{a.priority}</td>
                  <td style={{ padding: "8px" }}>
                    <StatusBadge status={a.status ? "success" : "default"}>{a.status ? "已发布" : "草稿"}</StatusBadge>
                  </td>
                  <td style={{ padding: "8px" }}>{a.read_count}</td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{a.created_by_email ?? "-"}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setEditor({ id: a.id, title: a.title, content: a.content, type: a.type, priority: a.priority, publish: a.status })} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", padding: "4px 10px" }}>编辑</button>
                    <button onClick={() => viewReaders(a.id)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", padding: "4px 10px", marginLeft: 6 }}>阅读</button>
                    <ConfirmPopover title="确定要删除此公告吗？" description="此操作不可撤销" onConfirm={() => delMut.mutate(a.id)}>
                      <button style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", padding: "4px 10px", marginLeft: 6 }}>删除</button>
                    </ConfirmPopover>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.id != null ? "编辑公告" : "新建公告"} width={560}>
        {editor && (
          <>
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
              <button onClick={() => setEditor(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !editor.title || !editor.content} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>{saveMut.isPending ? "保存中..." : "保存"}</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!readers} onClose={() => setReaders(null)} title={`已读用户（${readers?.length ?? 0}）`} width={480}>
        {readers && readers.length === 0 ? <EmptyState title="暂无用户阅读" /> : readers?.map(r => (
          <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between" }}>
            <span>{r.email}</span><span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{new Date(r.read_at).toLocaleString()}</span>
          </div>
        ))}
      </Modal>
    </div>
  );
}

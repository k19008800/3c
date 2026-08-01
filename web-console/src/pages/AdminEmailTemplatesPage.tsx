import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface ET { id: number; name: string; subject_zh: string; subject_en: string | null; description: string | null; updated_at: string; }
interface VarInfo { username: string; amount: string; time: string; balance: string; keyName: string; modelName: string; reason: string; code: string; }
interface EmailLog { id: number; to_address: string; subject: string; template_name: string | null; status: string; error: string | null; created_at: string; }

function TabBar({ tab, setTab }: { tab: string; setTab: (t: any) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <button onClick={() => setTab("templates")} style={{ ...btnBase, background: tab === "templates" ? "#2563eb" : "#fff", color: tab === "templates" ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>模板管理</button>
      <button onClick={() => setTab("logs")} style={{ ...btnBase, background: tab === "logs" ? "#2563eb" : "#fff", color: tab === "logs" ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>发送日志</button>
    </div>
  );
}
function Notice({ notice, setNotice }: { notice: { type: "success" | "error"; msg: string }; setNotice: (n: any) => void }) {
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
      {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
    </div>
  );
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

export default function AdminEmailTemplatesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"templates" | "logs">("templates");
  const [editor, setEditor] = useState<{ name?: string | null; subject_zh: string; body_html_zh: string; subject_en: string; body_html_en: string; description: string } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; body: string; smtp_enabled?: boolean; templateName?: string } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: async () => (await api.get<{ data: { list: ET[]; available_vars: VarInfo } }>("/admin/email-templates")).data.data,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { subject_zh: editor!.subject_zh, body_html_zh: editor!.body_html_zh, subject_en: editor!.subject_en || undefined, body_html_en: editor!.body_html_en || undefined, description: editor!.description || undefined };
      return editor!.name != null ? (await api.put(`/admin/email-templates/${editor!.name}`, body)).data : (await api.post("/admin/email-templates", { name: editor!.name, ...body })).data;
    },
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已保存" }); setEditor(null); qc.invalidateQueries({ queryKey: ["admin-email-templates"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const delMut = useMutation({
    mutationFn: async (name: string) => (await api.delete(`/admin/email-templates/${name}`)).data,
    onSuccess: () => { setNotice({ type: "success", msg: "已删除" }); qc.invalidateQueries({ queryKey: ["admin-email-templates"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const testMut = useMutation({
    mutationFn: async (name: string) => (await api.post(`/admin/email-templates/${name}/test`)).data,
    onSuccess: (d: { data?: { subject_zh?: string; body_html_zh?: string; smtp_enabled?: boolean } }, name: string) => { setPreview({ subject: d?.data?.subject_zh ?? "", body: d?.data?.body_html_zh ?? "", smtp_enabled: d?.data?.smtp_enabled ?? false, templateName: name }); setTestTo(""); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const sendMut = useMutation({
    mutationFn: async ({ template, to }: { template: string; to: string }) => (await api.post(`/admin/email-templates/${template}/test`, { to })).data,
    onSuccess: (d: { data?: { message?: string }; message?: string }) => { setNotice({ type: "success", msg: d?.data?.message ?? d?.message ?? "测试邮件已发送" }); setPreview(null); qc.invalidateQueries({ queryKey: ["admin-email-logs"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const logsQ = useQuery({
    queryKey: ["admin-email-logs"],
    queryFn: async () => (await api.get<{ data: { list: EmailLog[] } }>("/admin/email-logs?page_size=100")).data.data.list,
    enabled: tab === "logs",
  });

  if (tab === "logs") {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ marginBottom: 20 }}>邮件发送日志</h2>
        <TabBar tab={tab} setTab={setTab} />
        <div style={card}>
          {logsQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (logsQ.data?.length ?? 0) === 0 ? <div style={{ color: "#94a3b8", padding: 30, textAlign: "center" }}>暂无发送记录</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "8px" }}>收件人</th><th style={{ padding: "8px" }}>主题</th><th style={{ padding: "8px" }}>模板</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>错误</th><th style={{ padding: "8px" }}>时间</th></tr></thead>
              <tbody>
                {logsQ.data?.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px" }}>{l.to_address}</td>
                    <td style={{ padding: "8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.subject}>{l.subject}</td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{l.template_name ?? "-"}</td>
                    <td style={{ padding: "8px" }}><span style={{ padding: "2px 10px", borderRadius: 6, fontSize: 12, background: l.status === "sent" ? "#dcfce7" : "#fee2e2", color: l.status === "sent" ? "#166534" : "#991b1b" }}>{l.status}</span></td>
                    <td style={{ padding: "8px", color: "#991b1b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.error ?? ""}>{l.error ?? "-"}</td>
                    <td style={{ padding: "8px", color: "#64748b", fontSize: 12 }}>{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {notice && <Notice notice={notice} setNotice={setNotice} />}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>邮件模板</h2>
      <TabBar tab={tab} setTab={setTab} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setEditor({ name: "", subject_zh: "", body_html_zh: "", subject_en: "", body_html_en: "", description: "" })} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>+ 新建模板</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? <div style={{ color: "#94a3b8" }}>暂无模板</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "8px" }}>模板名</th><th style={{ padding: "8px" }}>中文标题</th><th style={{ padding: "8px" }}>说明</th><th style={{ padding: "8px" }}>操作</th></tr></thead>
            <tbody>
              {listQ.data?.list.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: "8px" }}>{t.subject_zh}</td>
                  <td style={{ padding: "8px", color: "#64748b" }}>{t.description ?? "-"}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setEditor({ name: t.name, subject_zh: t.subject_zh, body_html_zh: "", subject_en: t.subject_en ?? "", body_html_en: "", description: t.description ?? "" })} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>编辑</button>
                    <button onClick={() => testMut.mutate(t.name)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px", marginLeft: 6 }}>测试</button>
                    <button onClick={() => delMut.mutate(t.name)} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b", padding: "4px 10px", marginLeft: 6 }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 变量对照 */}
      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={{ marginBottom: 12 }}>可用变量</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 8, fontSize: 13 }}>
          {Object.entries(listQ.data?.available_vars ?? {}).map(([k, v]) => <div key={k}><code>{`{{${k}}}`}</code> <span style={{ color: "#64748b" }}>{v}</span></div>)}
        </div>
      </div>

      {/* 编辑器弹窗 */}
      {editor && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 620, maxHeight: "85vh", overflow: "auto" }}>
            <h3 style={{ marginBottom: 16 }}>{editor.name ? `编辑模板 · ${editor.name}` : "新建模板"}</h3>
            {editor.name === "" && <input value={editor.name ?? ""} onChange={(e) => setEditor({ ...editor!, name: e.target.value })} placeholder="模板名（唯一标识，如 recharge_success）*" style={inp} />}
            <input value={editor.subject_zh} onChange={(e) => setEditor({ ...editor, subject_zh: e.target.value })} placeholder="中文标题（支持 {{变量}}）*" style={inp} />
            <textarea value={editor.body_html_zh} onChange={(e) => setEditor({ ...editor, body_html_zh: e.target.value })} placeholder="中文正文 HTML（支持 {{变量}}）*" rows={5} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
            <input value={editor.subject_en} onChange={(e) => setEditor({ ...editor, subject_en: e.target.value })} placeholder="英文标题（可选）" style={inp} />
            <textarea value={editor.body_html_en} onChange={(e) => setEditor({ ...editor, body_html_en: e.target.value })} placeholder="英文正文 HTML（可选）" rows={3} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
            <input value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} placeholder="使用场景说明" style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditor(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !editor.subject_zh || !editor.body_html_zh} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>{saveMut.isPending ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 测试预览弹窗 */}
      {preview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 540 }}>
            <h3 style={{ marginBottom: 12 }}>测试渲染（示例值）</h3>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{preview.subject}</div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.7, maxHeight: 240, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: preview.body }} />
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
                {preview.smtp_enabled ? "✅ SMTP 已配置 —— 输入收件邮箱可真实发送测试邮件" : "⚠️ SMTP 未配置（需在服务端设置 SMTP_HOST/USER/PASS），当前仅预览渲染"}
              </div>
              {preview.smtp_enabled && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="收件邮箱" style={{ ...inp, marginBottom: 0, flex: 1 }} />
                  <button onClick={() => sendMut.mutate({ template: preview.templateName ?? "", to: testTo })} disabled={!testTo.trim() || sendMut.isPending} style={{ ...btnBase, background: "#16a34a", color: "#fff", whiteSpace: "nowrap" }}>
                    {sendMut.isPending ? "发送中..." : "真实发送"}
                  </button>
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, textAlign: "right" }}><button onClick={() => setPreview(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button></div>
          </div>
        </div>
      )}

      {notice && <Notice notice={notice} setNotice={setNotice} />}
    </div>
  );
}

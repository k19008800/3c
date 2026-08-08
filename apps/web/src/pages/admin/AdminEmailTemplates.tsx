import { useState, useEffect } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import { api, apiGet, apiPost, apiPut } from "../../services/api";

// ── Types ──
interface ApiTemplate {
  id: number;
  name: string;
  subject_zh: string;
  subject_en: string | null;
  description: string | null;
  updated_at: string;
}

interface EmailTemplateUI {
  id: string;
  name: string;
  slug: string;
  subject: string;
  description: string;
  variables: string[];
  lastEdited: string;
  status: "active" | "draft";
}

// ── Component ──
export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplateUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState<EmailTemplateUI | null>(null);
  const [content, setContent] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showTest, setShowTest] = useState(false);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ list: ApiTemplate[]; available_vars: string[] }>("/admin/email-templates");
      const ui: EmailTemplateUI[] = data.list.map((t) => ({
        id: String(t.id),
        name: t.name,
        slug: t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        subject: t.subject_zh,
        description: t.description || "",
        variables: (data.available_vars || []).slice(0, 5),
        lastEdited: t.updated_at?.slice(0, 10) || "",
        status: "active",
      }));
      setTemplates(ui);
    } catch (e: any) {
      setError(e.message || "加载邮件模板失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const openEditor = (tpl: EmailTemplateUI) => {
    setEditTemplate(tpl);
    setContent(`<h1>${tpl.subject}</h1>\n<p>尊敬的 {{username}}，你好！</p>\n<p>这是一封测试邮件模板。</p>\n<p>祝使用愉快！</p>\n<p>— 3Cloud 团队</p>`);
    setPreviewMode(false);
    setSent(false);
    setSaveMsg(null);
  };

  const saveTemplate = async () => {
    if (!editTemplate) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await apiPut(`/admin/email-templates/${editTemplate.name}`, {
        subject_zh: editTemplate.subject,
        body_html_zh: content,
      });
      setSaveMsg("✅ 模板已保存");
    } catch (e: any) {
      setSaveMsg(`❌ ${e.message || "保存失败"}`);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail.trim() || !editTemplate) return;
    try {
      await apiPost(`/admin/email-templates/${editTemplate.name}/test`, {
        to: testEmail.trim(),
      });
      setSent(true);
      setTimeout(() => { setShowTest(false); setSent(false); setTestEmail(""); }, 2000);
    } catch (e: any) {
      alert(e.message || "发送失败");
    }
  };

  const variableInsert = (v: string) => {
    setContent((prev) => prev + " " + v);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <span className="loading-spinner" /> 加载中…
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="panel" style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={{ color: "var(--color-danger)" }}>{error}</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={loadTemplates}>
            重试
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="page-title">
        邮件模板管理
        <HelpModal title="邮件模板管理">
          <p>管理系统中所有自动发送的邮件模板，支持富文本编辑、变量插入和预览。</p>
          <p style={{ marginTop: 8 }}>📧 功能说明：</p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li><strong>模板卡片</strong>：从后端加载邮件模板，按用途分类</li>
            <li><strong>富文本编辑器</strong>：支持 HTML 内容编辑，可插入变量</li>
            <li><strong>变量面板</strong>：点击即可插入预定义变量</li>
            <li><strong>预览/发送测试</strong>：实时预览渲染效果，可发送测试邮件到指定地址</li>
          </ul>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理通知邮件的模板内容和发送规则</p>

      {/* Template Cards Grid */}
      {!editTemplate && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {templates.length === 0 ? (
            <div className="panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
              <div style={{ color: "var(--color-text-secondary)" }}>暂无邮件模板</div>
            </div>
          ) : (
            templates.map((tpl) => (
              <div key={tpl.id} className="panel" style={{ cursor: "pointer" }} onClick={() => openEditor(tpl)}>
                <div className="panel-header">
                  <div>
                    <span style={{ fontSize: 20, marginRight: 8 }}>
                      {tpl.status === "draft" ? "📝" : "📧"}
                    </span>
                    <strong>{tpl.name}</strong>
                  </div>
                  <span className={`badge ${tpl.status === "active" ? "badge-success" : "badge-warning"}`}>
                    {tpl.status === "active" ? "已启用" : "草稿"}
                  </span>
                </div>
                <div className="panel-body">
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                    {tpl.description}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
                    主题：{tpl.subject}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {tpl.variables.map((v) => (
                      <span key={v} className="badge badge-info" style={{ fontSize: 11 }}>
                        {v}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>
                    最后编辑：{tpl.lastEdited}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Editor */}
      {editTemplate && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex-wrap">
              <button className="btn btn-sm btn-secondary" onClick={() => setEditTemplate(null)}>
                ← 返回列表
              </button>
              <strong>编辑：{editTemplate.name}</strong>
              <span className="badge badge-info">{editTemplate.slug}</span>
            </div>
            <div className="flex-wrap">
              <button
                className={`btn btn-sm ${!previewMode ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setPreviewMode(false)}
              >
                编辑
              </button>
              <button
                className={`btn btn-sm ${previewMode ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setPreviewMode(true)}
              >
                预览
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowTest(true)}>
                发送测试
              </button>
            </div>
          </div>
          <div className="panel-body">
            {saveMsg && (
              <div
                style={{
                  padding: "8px 12px",
                  marginBottom: 12,
                  borderRadius: "var(--radius-md)",
                  background: saveMsg.startsWith("✅") ? "var(--color-success-bg)" : "var(--color-danger-bg)",
                  color: saveMsg.startsWith("✅") ? "var(--color-success-text)" : "var(--color-danger-text)",
                  fontSize: 13,
                }}
              >
                {saveMsg}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16 }}>
              {/* Editor Area */}
              <div>
                {previewMode ? (
                  <div
                    style={{
                      minHeight: 300,
                      padding: 16,
                      background: "#fafafa",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--color-divider)",
                    }}
                    dangerouslySetInnerHTML={{ __html: content }}
                  />
                ) : (
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: 300, fontFamily: "var(--font-mono)", fontSize: 13 }}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                )}
              </div>

              {/* Variable Panel */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>可用变量</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {editTemplate.variables.map((v) => (
                    <button
                      key={v}
                      className="btn btn-xs btn-secondary"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                      onClick={() => variableInsert(v)}
                      title="点击插入"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 16, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  <p>点击变量可插入到编辑器光标位置</p>
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding: "0 20px 16px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setEditTemplate(null)}>取消</button>
            <button className="btn btn-primary" onClick={saveTemplate} disabled={saving}>
              {saving ? "保存中…" : "保存模板"}
            </button>
          </div>
        </div>
      )}

      {/* Send Test Modal */}
      {showTest && (
        <div className="modal-overlay" onClick={() => setShowTest(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>发送测试邮件</h3>
              <button className="modal-close" onClick={() => setShowTest(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">收件邮箱</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>
              {sent && (
                <div style={{ padding: "8px 12px", background: "var(--color-success-bg)", borderRadius: "var(--radius-md)", color: "var(--color-success-text)", fontSize: 13 }}>
                  ✅ 测试邮件已发送至 {testEmail}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTest(false)}>取消</button>
              <button className="btn btn-primary" onClick={sendTest} disabled={!testEmail.trim()}>
                发送测试
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

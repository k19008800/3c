import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

interface ContentItem { id: number; type: string; title: string; content: string; slug: string; status: string; updated_at: string; }

export default function AdminContentPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [editContent, setEditContent] = useState("");
  // 后端加载失败标记：GET 404 视为未接入
  const [backendMissing, setBackendMissing] = useState(false);

  useEffect(() => {
    api.get("/admin/content").then(r => setItems(r.data?.data?.list ?? []))
      .catch((e: any) => { if (e?.response?.status === 404) setBackendMissing(true); });
  }, []);

  function openEdit(item: ContentItem) {
    setEditing(item);
    setEditContent(item.content);
  }

  async function saveContent() {
    if (!editing) return;
    try {
      await api.put(`/admin/content/${editing.id}`, { content: editContent });
      toast.success(`${editing.title} 已更新`);
      setEditing(null);
      const r = await api.get("/admin/content");
      setItems(r.data?.data?.list ?? []);
    } catch (e: any) {
      toast.error(e?.response?.status === 404 ? "内容管理后端未接入（/admin/content 待实现），保存不生效" : (e?.response?.data?.message ?? e?.message ?? "保存失败"));
    }
  }

  const typeLabels: Record<string, string> = {
    terms: "服务条款", privacy: "隐私政策", about: "关于我们",
    contact: "联系我们", faq: "常见问题", help: "帮助中心",
  };

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📄</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>内容管理
          <HelpIcon text="管理平台公开页面内容：服务条款、隐私政策、关于我们、FAQ 等。支持富文本编辑（Markdown）。" level="page" />
          {backendMissing && <span style={{ fontSize: 11, color: "#f59e0b", marginLeft: 8 }}>⚠️ 后端未接入（/admin/content 待实现）</span>}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <h4 style={{ margin: "0 0 16px" }}>📋 内容列表</h4>
          {items.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  {typeLabels[item.type] ?? item.type} · 更新于 {new Date(item.updated_at).toLocaleDateString()}
                </div>
              </div>
              <button onClick={() => openEdit(item)} style={{ padding: "4px 14px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer", fontSize: 12 }}>编辑</button>
            </div>
          ))}
          {items.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#888" }}>暂无内容项</div>}
        </div>

        {editing && (
          <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <h4 style={{ margin: "0 0 12px" }}>✏️ 编辑：{editing.title} <HelpIcon text="内容支持 Markdown 格式。编辑后即时预览。" /></h4>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>类型：{typeLabels[editing.type] ?? editing.type} · 标识：{editing.slug}</div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              style={{ width: "100%", minHeight: 300, padding: "12px", border: "1px solid var(--color-border)", borderRadius: 6, fontFamily: "monospace", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveContent} style={{ padding: "8px 20px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>保存</button>
              <button onClick={() => setEditing(null)} style={{ padding: "8px 20px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)", cursor: "pointer" }}>取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

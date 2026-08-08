import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, Table, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

interface I18nEntry { id: number; key: string; namespace: string; zh_cn: string; en_us: string; ja_jp: string; ko_kr: string; updated_at: string; }
interface Namespace { name: string; label: string; key_count: number; color: string; }

const NAMESPACES: Namespace[] = [
  { name: "common", label: "通用文案", key_count: 0, color: "#1890ff" },
  { name: "portal", label: "用户门户", key_count: 0, color: "#52c41a" },
  { name: "admin", label: "管理后台", key_count: 0, color: "#fa8c16" },
  { name: "error", label: "错误提示", key_count: 0, color: "#f5222d" },
  { name: "email", label: "邮件模板", key_count: 0, color: "#722ed1" },
  { name: "notification", label: "通知消息", key_count: 0, color: "#13c2c2" },
];

const LANGS = [
  { code: "zh_cn", flag: "🇨🇳", label: "简体中文" },
  { code: "en_us", flag: "🇺🇸", label: "English" },
  { code: "ja_jp", flag: "🇯🇵", label: "日本語" },
  { code: "ko_kr", flag: "🇰🇷", label: "한국어" },
];

export default function AdminI18nPage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<I18nEntry[]>([]);
  const [namespace, setNamespace] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<I18nEntry | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newNs, setNewNs] = useState("common");
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  useEffect(() => { loadEntries(); }, [namespace]);

  async function loadEntries() {
    try {
      const r = await api.get("/admin/i18n/entries", { params: { namespace: namespace || undefined } });
      setEntries(r.data?.data?.list ?? []);
    } catch {}
  }

  function openEdit(e: I18nEntry) {
    setEditing(e);
    setEditValues({ zh_cn: e.zh_cn, en_us: e.en_us, ja_jp: e.ja_jp, ko_kr: e.ko_kr });
  }

  async function saveEdit() {
    if (!editing) return;
    await api.put(`/admin/i18n/entries/${editing.id}`, editValues);
    toast.success("翻译已更新");
    setEditing(null);
    loadEntries();
  }

  async function deleteEntry(id: number) {
    if (!confirm("确认删除此翻译键？")) return;
    await api.post(`/admin/i18n/entries/${id}/delete`, {});
    toast.success("已删除");
    loadEntries();
  }

  async function createEntry() {
    if (!newKey.trim()) { toast.error("键名不能为空"); return; }
    await api.post("/admin/i18n/entries", { key: newKey, namespace: newNs, ...newValues });
    toast.success("翻译键已创建");
    setShowNew(false); setNewKey(""); setNewValues({});
    loadEntries();
  }

  const filtered = entries.filter(e => !search || e.key.toLowerCase().includes(search.toLowerCase()) || Object.values(e).some(v => typeof v === "string" && v.toLowerCase().includes(search.toLowerCase())));

  const coverageData = LANGS.map(l => {
    const total = entries.length;
    const filled = entries.filter(e => (e as any)[l.code]).length;
    const pct = total ? Math.round((filled / total) * 100) : 100;
    return { ...l, filled, total, pct };
  });

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🌐</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>国际化翻译管理
          <HelpIcon text="管理多语言翻译键值。按命名空间分组，支持增删改查。覆盖率即时显示各语言翻译完成度。" level="page" />
        </span>
      </div>

      {/* Coverage Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {coverageData.map(l => (
          <div key={l.code} style={{ background: "var(--color-panel)", borderRadius: 8, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>{l.flag}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{l.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>{l.pct}%</div>
            <div style={{ height: 6, borderRadius: 3, background: "#f0f0f0", marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: l.pct >= 80 ? "#22c55e" : l.pct >= 50 ? "#f59e0b" : "#e53935", width: `${l.pct}%`, transition: "width .6s" }} />
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{l.filled}/{l.total} 项</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#666" }}>命名空间:</span>
        {[{ name: "", label: "全部", color: "#666" }, ...NAMESPACES].map(ns => (
          <button key={ns.name} onClick={() => setNamespace(ns.name)} style={{
            padding: "4px 14px", borderRadius: 14, border: namespace === ns.name ? "2px solid #4f6ef7" : "1px solid var(--color-border)",
            background: namespace === ns.name ? "#eef2ff" : "var(--color-panel)", color: namespace === ns.name ? "#4f6ef7" : "#666",
            cursor: "pointer", fontSize: 12, fontWeight: 500,
          }}>{ns.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <input placeholder="搜索键名/翻译值..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid var(--color-border)", borderRadius: 6, width: 240, fontSize: 13 }} />
        <button onClick={() => setShowNew(true)} style={{ padding: "6px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          + 新增翻译键
          <HelpIcon text="创建新的翻译键。键名全局唯一，建议使用 namespace.key 格式。" />
        </button>
      </div>

      {/* New entry form */}
      {showNew && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            <select value={newNs} onChange={e => setNewNs(e.target.value)} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }}>
              {NAMESPACES.map(ns => <option key={ns.name} value={ns.name}>{ns.label}</option>)}
            </select>
            <input placeholder="翻译键名 (如 common.hello)" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} />
          </div>
          {LANGS.map(l => (
            <div key={l.code} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ width: 80, fontSize: 13, color: "#666" }}>{l.flag} {l.label}</span>
              <input placeholder={`${l.label}翻译`} value={newValues[l.code] ?? ""} onChange={e => setNewValues({ ...newValues, [l.code]: e.target.value })}
                style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={createEntry} style={{ padding: "6px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>创建</button>
            <button onClick={() => setShowNew(false)} style={{ padding: "6px 16px", background: "var(--color-border)", border: "none", borderRadius: 4, cursor: "pointer" }}>取消</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600 }}>键名</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600 }}>命名空间</th>
              {LANGS.map(l => <th key={l.code} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600 }}>{l.flag}</th>)}
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => {
              const ns = NAMESPACES.find(n => n.name === e.namespace);
              return (
                <tr key={e.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: "#4f6ef7" }}>{e.key}</td>
                  <td style={{ padding: "8px 14px" }}><span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 500, background: `${ns?.color}20`, color: ns?.color }}>{ns?.label ?? e.namespace}</span></td>
                  {LANGS.map(l => (
                    <td key={l.code} style={{ padding: "8px 14px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(e as any)[l.code] ? <span style={{ color: "#333" }}>{(e as any)[l.code]}</span> : <span style={{ color: "#e53935", fontStyle: "italic" }}>未翻译</span>}
                    </td>
                  ))}
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>
                    <button onClick={() => openEdit(e)} style={{ padding: "2px 10px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer", marginRight: 4 }}>编辑</button>
                    <button onClick={() => deleteEntry(e.id)} style={{ padding: "2px 10px", border: "1px solid #e53935", borderRadius: 4, background: "var(--color-panel)", color: "#e53935", cursor: "pointer" }}>删除</button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无翻译数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`编辑翻译 — ${editing?.key ?? ""}`}>
        {editing && (
          <div>
            <div style={{ background: "#f5f5f5", borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontFamily: "monospace", fontSize: 13 }}>{editing.key}</div>
            {LANGS.map(l => (
              <div key={l.code} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                <span style={{ width: 90, fontSize: 13, color: "#888" }}>{l.flag} {l.label}</span>
                <input value={editValues[l.code] ?? ""} onChange={e => setEditValues({ ...editValues, [l.code]: e.target.value })}
                  style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13 }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)", cursor: "pointer" }}>取消</button>
              <button onClick={saveEdit} style={{ padding: "8px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>保存翻译</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

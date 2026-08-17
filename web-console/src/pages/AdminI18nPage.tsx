import { useState, useEffect } from "react";
import { api, extractError } from "../lib/api";
import { HelpIcon, Modal, useToast } from "@3cloud/shared-ui";

/**
 * 国际化翻译管理页 — 对齐 P2-3 后端契约（/api/v1/admin/i18n/entries）
 *
 * 后端 i18n_entries 为「一行 = 一个 key × 一个 lang」行式存储
 * （key/lang/value/scope/status，unique(key, lang)）。
 * 本页把行式数据在客户端按 key 分组为「一行多语言列」的表格展示；
 * 语言代码映射：zh_cn→zh-CN、en_us→en、ja_jp→ja-JP、ko_kr→ko-KR。
 * 删除为后端软删（status='disabled'），公开接口自动过滤。
 */

interface BackendEntry {
  id: number;
  key: string;
  lang: string;
  value: string;
  scope: string;
  status: string;
  updated_by: number | null;
  updated_at: string;
}

/** 表格行（按 key 分组，各语言列 + 各语言行 id 用于编辑/删除） */
interface I18nRow {
  key: string;
  scope: string;
  langs: Record<string, { id: number; value: string; status: string }>;
  updated_at: string;
}

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
  { code: "zh_cn", lang: "zh-CN", flag: "🇨🇳", label: "简体中文" },
  { code: "en_us", lang: "en", flag: "🇺🇸", label: "English" },
  { code: "ja_jp", lang: "ja-JP", flag: "🇯🇵", label: "日本語" },
  { code: "ko_kr", lang: "ko-KR", flag: "🇰🇷", label: "한국어" },
];

export default function AdminI18nPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<I18nRow[]>([]);
  const [namespace, setNamespace] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<I18nRow | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newNs, setNewNs] = useState("common");
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  useEffect(() => { loadEntries(); }, [namespace]);

  /** 拉取后端行式条目 → 按 key 分组为表格行 */
  async function loadEntries() {
    try {
      const r = await api.get("/admin/i18n/entries", {
        params: { scope: namespace || undefined, page: 1, pageSize: 500 },
      });
      const items: BackendEntry[] = r.data?.data?.items ?? [];
      const byKey = new Map<string, I18nRow>();
      for (const it of items) {
        let row = byKey.get(it.key);
        if (!row) {
          row = { key: it.key, scope: it.scope, langs: {}, updated_at: it.updated_at };
          byKey.set(it.key, row);
        }
        row.langs[it.lang] = { id: it.id, value: it.value, status: it.status };
        if (new Date(it.updated_at) > new Date(row.updated_at)) row.updated_at = it.updated_at;
      }
      setRows([...byKey.values()]);
    } catch {}
  }

  function langValue(row: I18nRow, l: { code: string; lang: string }): string {
    return row.langs[l.lang]?.value ?? "";
  }

  function openEdit(e: I18nRow) {
    setEditing(e);
    setEditValues(Object.fromEntries(LANGS.map((l) => [l.code, langValue(e, l)])));
  }

  /** 每个已存在的语言行单独 PUT 更新 value */
  async function saveEdit() {
    if (!editing) return;
    try {
      for (const l of LANGS) {
        const cell = editing.langs[l.lang];
        if (!cell) continue; // 该语言尚未翻译 → 走「新增翻译键」创建
        await api.put(`/admin/i18n/entries/${cell.id}`, { value: editValues[l.code] ?? "" });
      }
      toast.success("翻译已更新");
      setEditing(null);
      loadEntries();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  /** 删除 key 下所有语言行（后端软删 status=disabled） */
  async function deleteEntry(e: I18nRow) {
    if (!confirm(`确认删除翻译键「${e.key}」？（软删，可在列表中按状态筛选查看）`)) return;
    try {
      for (const l of LANGS) {
        const cell = e.langs[l.lang];
        if (cell) await api.delete(`/admin/i18n/entries/${cell.id}`);
      }
      toast.success("已删除");
      loadEntries();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  /** 创建：按语言逐个 POST（key + lang + value + scope） */
  async function createEntry() {
    if (!newKey.trim()) { toast.error("键名不能为空"); return; }
    const provided = LANGS.filter((l) => (newValues[l.code] ?? "").trim());
    if (provided.length === 0) { toast.error("请至少填写一种语言的翻译"); return; }
    try {
      for (const l of provided) {
        await api.post("/admin/i18n/entries", {
          key: newKey.trim(),
          lang: l.lang,
          value: (newValues[l.code] ?? "").trim(),
          scope: newNs,
        });
      }
      toast.success("翻译键已创建");
      setShowNew(false); setNewKey(""); setNewValues({});
      loadEntries();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error(`已存在相同 key+lang 的条目：${extractError(err)}`);
      } else {
        toast.error(extractError(err));
      }
    }
  }

  const filtered = rows.filter((e) => !search ||
    e.key.toLowerCase().includes(search.toLowerCase()) ||
    Object.values(e.langs).some((v) => v.value.toLowerCase().includes(search.toLowerCase())));

  const coverageData = LANGS.map((l) => {
    const total = rows.length;
    const filled = rows.filter((e) => langValue(e, l)).length;
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
        {coverageData.map((l) => (
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
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#666" }}>命名空间:</span>
        {[{ name: "", label: "全部", color: "#666" }, ...NAMESPACES].map((ns) => (
          <button key={ns.name} onClick={() => setNamespace(ns.name)} style={{
            padding: "4px 14px", borderRadius: 14, border: namespace === ns.name ? "2px solid #4f6ef7" : "1px solid var(--color-border)",
            background: namespace === ns.name ? "#eef2ff" : "var(--color-panel)", color: namespace === ns.name ? "#4f6ef7" : "#666",
            cursor: "pointer", fontSize: 12, fontWeight: 500,
          }}>{ns.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <input placeholder="搜索键名/翻译值..." value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid var(--color-border)", borderRadius: 6, width: 240, fontSize: 13 }} />
        <button onClick={() => setShowNew(true)} style={{ padding: "6px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          + 新增翻译键
          <HelpIcon text="创建新的翻译键。键名全局唯一，建议使用 namespace.key 格式；同一键可分别填写多种语言。" />
        </button>
      </div>

      {/* New entry form */}
      {showNew && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            <select value={newNs} onChange={(e) => setNewNs(e.target.value)} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }}>
              {NAMESPACES.map((ns) => <option key={ns.name} value={ns.name}>{ns.label}</option>)}
            </select>
            <input placeholder="翻译键名 (如 common.hello)" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} />
          </div>
          {LANGS.map((l) => (
            <div key={l.code} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ width: 80, fontSize: 13, color: "#666" }}>{l.flag} {l.label}</span>
              <input placeholder={`${l.label}翻译`} value={newValues[l.code] ?? ""} onChange={(e) => setNewValues({ ...newValues, [l.code]: e.target.value })}
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
              {LANGS.map((l) => <th key={l.code} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600 }}>{l.flag}</th>)}
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const ns = NAMESPACES.find((n) => n.name === e.scope);
              return (
                <tr key={e.key} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: "#4f6ef7" }}>{e.key}</td>
                  <td style={{ padding: "8px 14px" }}><span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 500, background: `${ns?.color}20`, color: ns?.color }}>{ns?.label ?? e.scope}</span></td>
                  {LANGS.map((l) => (
                    <td key={l.code} style={{ padding: "8px 14px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {langValue(e, l) ? <span style={{ color: "#333" }}>{langValue(e, l)}</span> : <span style={{ color: "#e53935", fontStyle: "italic" }}>未翻译</span>}
                    </td>
                  ))}
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>
                    <button onClick={() => openEdit(e)} style={{ padding: "2px 10px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer", marginRight: 4 }}>编辑</button>
                    <button onClick={() => deleteEntry(e)} style={{ padding: "2px 10px", border: "1px solid #e53935", borderRadius: 4, background: "var(--color-panel)", color: "#e53935", cursor: "pointer" }}>删除</button>
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
            {LANGS.map((l) => (
              <div key={l.code} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                <span style={{ width: 90, fontSize: 13, color: "#888" }}>{l.flag} {l.label}</span>
                {editing.langs[l.lang] ? (
                  <input value={editValues[l.code] ?? ""} onChange={(e) => setEditValues({ ...editValues, [l.code]: e.target.value })}
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13 }} />
                ) : (
                  <span style={{ flex: 1, fontSize: 12, color: "#e53935", fontStyle: "italic" }}>该语言尚未翻译，请使用「新增翻译键」补充</span>
                )}
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

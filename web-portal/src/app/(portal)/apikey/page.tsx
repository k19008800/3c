"use client";

import React, { useState } from "react";
import { StatusBadge, SearchBar, useToast } from "@3cloud/shared-ui";

interface KeyItem {
  id: string; name: string; keyPrefix: string; permission: string;
  lastCall: string; todayCalls: number;
  status: "success" | "warning" | "danger" | "info" | "default";
  statusText: string;
}

const MOCK_KEYS: KeyItem[] = [
  { id: "1", name: "生产环境", keyPrefix: "sk-prod-a1b2...", permission: "绑定供应商", lastCall: "2026-08-04 14:30", todayCalls: 1234, status: "warning", statusText: "即将过期" },
  { id: "2", name: "测试环境", keyPrefix: "sk-test-b3c4...", permission: "无限制", lastCall: "2026-08-04 12:00", todayCalls: 567, status: "success", statusText: "启用" },
  { id: "3", name: "数据分析", keyPrefix: "sk-ana-d5e6...", permission: "绑定分组", lastCall: "2026-08-03 18:20", todayCalls: 89, status: "success", statusText: "启用" },
  { id: "4", name: "废弃 Key", keyPrefix: "sk-old-f7g8...", permission: "无限制", lastCall: "2026-07-01 10:00", todayCalls: 0, status: "danger", statusText: "已禁用" },
];

export default function ApiKeysPage() {
  const { toast } = useToast();
  const [keys, setKeys] = useState(MOCK_KEYS);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newKeyName, setNewKeyName] = useState("新 Key");
  const [permissionMode, setPermissionMode] = useState("B");
  const [selectedGroup, setSelectedGroup] = useState("基础模型组（8 个模型）");
  const [expiryDate, setExpiryDate] = useState("");
  const [ipWhitelist, setIpWhitelist] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [copied, setCopied] = useState(false);

  const filtered = keys.filter(k => !search || k.name.includes(search) || k.keyPrefix.includes(search));

  const handleCreate = () => {
    setCreatedKey(`sk-new-${Math.random().toString(36).slice(2, 12)}`);
    setShowCreate(false);
    setShowSuccess(true);
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    toast.success("Key 已复制到剪贴板");
  };

  const handleDelete = (id: string) => {
    setKeys(prev => prev.filter(k => k.id !== id));
    toast.success("API Key 已删除");
  };

  const handleToggle = (id: string) => {
    setKeys(prev => prev.map(k => k.id !== id ? k : {
      ...k, status: (k.status === "danger" ? "success" : "danger") as KeyItem["status"],
      statusText: k.status === "danger" ? "启用" : "已禁用",
    }));
    toast.success("状态已更新");
  };

  const cell = (_v: string) => ({ padding: "14px 16px", borderBottom: "1px solid var(--color-divider-light)", fontSize: 13, color: "var(--color-text)" });
  const thStyle: React.CSSProperties = { textAlign: "left", padding: "14px 16px", background: "var(--color-table-header-bg)", fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--color-divider)", whiteSpace: "nowrap" };
  const panel = { background: "var(--color-panel)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-panel)" };

  return (
    <div style={{ padding: "var(--main-padding)" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowCreate(true)} style={{ background: "var(--color-primary)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>+ 创建 Key</button>
          <button onClick={() => { if (confirm("确定要重置所有 API Key 吗？所有旧 Key 将立即失效")) toast.success("已重置所有 Key"); }} style={{ background: "var(--color-panel)", color: "var(--color-danger-text)", border: "1px solid var(--color-danger-text)", padding: "10px 20px", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>⚠️ 重置所有 Key</button>
        </div>
        <SearchBar placeholder="搜索 Key 名称…" value={search} onChange={setSearch} />
      </div>

      {/* Table */}
      <div style={panel}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["名称","Key","权限模式","最后调用","今日调用","状态","操作"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-secondary)" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔑</div>
                  <div style={{ fontSize: 14, marginBottom: 20 }}>暂无 API Key</div>
                  <button onClick={() => setShowCreate(true)} style={{ background: "var(--color-primary)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>创建第一个 Key</button>
                </td></tr>
              ) : filtered.map((k, _i) => (
                <tr key={k.id} onMouseEnter={e => e.currentTarget.style.background = "var(--color-row-hover)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={cell(k.name)}>{k.name}</td>
                  <td style={cell(k.keyPrefix)}><span style={{ fontFamily: "var(--font-family-mono)", color: "var(--color-text-secondary)" }}>{k.keyPrefix}</span></td>
                  <td style={cell(k.permission)}>{k.permission}</td>
                  <td style={cell(k.lastCall)}>{k.lastCall}</td>
                  <td style={cell(String(k.todayCalls))}>{k.todayCalls.toLocaleString()}</td>
                  <td style={cell(k.statusText)}><StatusBadge status={k.status}>{k.statusText}</StatusBadge></td>
                  <td style={cell("")}>
                    <button style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 12, cursor: "pointer", marginRight: 4 }}>复制</button>
                    <button style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 12, cursor: "pointer", marginRight: 4 }}>编辑</button>
                    <button onClick={() => handleDelete(k.id)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 12, cursor: "pointer", marginRight: 4 }}>删除</button>
                    {k.status === "danger" ? <button onClick={() => handleToggle(k.id)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 12, cursor: "pointer" }}>启用</button> : null}
                    <button style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 12, cursor: "pointer" }}>📊 用量分析</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position: "fixed", inset: 0, background: "var(--color-modal-overlay)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--color-panel)", borderRadius: 16, width: 520, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ fontSize: 18, fontWeight: 600 }}>创建 API Key</h3><button onClick={() => setShowCreate(false)} style={{ background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer" }}>✕</button></div>
            <div style={{ padding: "20px 24px" }}>
              {[
                { label: "Key 名称 *", el: <input type="text" placeholder="例如：生产环境" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} style={{ width: "100%", height: 40, border: "1px solid var(--color-border)", borderRadius: 8, padding: "0 12px", fontSize: 14, background: "var(--color-panel)", color: "var(--color-text)" }} /> },
                { label: "权限模式 *", el: <select value={permissionMode} onChange={e => setPermissionMode(e.target.value)} style={{ width: "100%", height: 40, border: "1px solid var(--color-border)", borderRadius: 8, padding: "0 12px", fontSize: 14, background: "var(--color-panel)", color: "var(--color-text)" }}><option value="A">A - 绑定供应商+模型</option><option value="B">B - 绑定模型分组</option><option value="C">C - 无限制</option></select> },
                { label: "选择分组", el: <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} style={{ width: "100%", height: 40, border: "1px solid var(--color-border)", borderRadius: 8, padding: "0 12px", fontSize: 14, background: "var(--color-panel)", color: "var(--color-text)" }}><option>基础模型组（8 个模型）</option><option>高级模型组（5 个模型）</option><option>图像模型组（3 个模型）</option></select> },
                { label: "过期时间（可选）", el: <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} style={{ width: "100%", height: 40, border: "1px solid var(--color-border)", borderRadius: 8, padding: "0 12px", fontSize: 14, background: "var(--color-panel)", color: "var(--color-text)" }} /> },
                { label: "IP 白名单（可选，一行一个）", el: <textarea placeholder={"192.168.1.1\n10.0.0.0/24"} value={ipWhitelist} onChange={e => setIpWhitelist(e.target.value)} style={{ width: "100%", height: 60, border: "1px solid var(--color-border)", borderRadius: 8, padding: 8, fontSize: 13, resize: "none", background: "var(--color-panel)", color: "var(--color-text)", fontFamily: "inherit" }} /> },
              ].map((f, i) => (
                <div key={i} style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>{f.label}</label>{f.el}</div>
              ))}
            </div>
            <div style={{ padding: "0 24px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: "10px 24px", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-panel)", cursor: "pointer", fontSize: 14 }}>取消</button>
              <button onClick={handleCreate} style={{ padding: "10px 24px", border: "none", borderRadius: 8, background: "var(--color-primary)", color: "#fff", cursor: "pointer", fontSize: 14 }}>确认创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div onClick={() => setShowSuccess(false)} style={{ position: "fixed", inset: 0, background: "var(--color-modal-overlay)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--color-panel)", borderRadius: 16, width: 480, maxWidth: "90vw" }}>
            <div style={{ padding: 32, textAlign: "center" }}>
              <h3 style={{ fontSize: 18, marginBottom: 20 }}>✅ API Key 创建成功</h3>
              <div style={{ background: "var(--color-disabled-bg)", borderRadius: 8, padding: 16, fontFamily: "var(--font-family-mono)", fontSize: 16, letterSpacing: 1, margin: "16px 0", wordBreak: "break-all" }}>{createdKey}</div>
              <div style={{ color: "var(--color-danger-text)", fontSize: 13, marginBottom: 16 }}>⚠️ 该 Key 仅展示一次，请立即复制保存</div>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button onClick={handleCopy} style={{ padding: "10px 24px", border: "none", borderRadius: 8, background: "var(--color-primary)", color: "#fff", cursor: "pointer", fontSize: 14 }}>{copied ? "已复制 ✅" : "复制 Key"}</button>
                <button onClick={() => setShowSuccess(false)} style={{ padding: "10px 24px", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-panel)", cursor: "pointer", fontSize: 14 }}>返回列表</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

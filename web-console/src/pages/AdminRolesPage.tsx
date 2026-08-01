import { useState, useEffect } from "react";
import { api } from "../lib/api";

/**
 * §30 角色管理页 —— 角色列表 & 权限编辑 & 新增角色 & 删除角色
 * 页面标题旁 [?] 帮助说明按钮
 */
interface Role {
  id: number; name: string; label: string; description: string | null;
  permissions: number; is_system: boolean; user_count: number; sort_order: number;
  created_at: string; updated_at: string;
}
interface PermGroup { group: string; groupIcon: string; permissions: { key: string; label: string; description?: string }[] }

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [tree, setTree] = useState<PermGroup[]>([]);
const [editing, setEditing] = useState<Role | null>(null);
  const [editPerms, setEditPerms] = useState<number[]>([]);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newBits, setNewBits] = useState<number[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    api.get<{ data: { list: Role[] } }>("/admin/roles").then(r => setRoles(r.data.data.list));
    api.get<{ data: { tree: PermGroup[] } }>("/admin/roles/permissions/list").then(r => {
      setTree(r.data.data.tree);
    });
  }, []);

  function bitList(mask: number): number[] {
    const r: number[] = [];
    for (let i = 0; i < 30; i++) if (mask & (1 << i)) r.push(i);
    return r;
  }

  function toggleEdit(r: Role) {
    setEditing(r);
    setEditPerms(bitList(r.permissions));
  }

  async function saveEdit() {
    if (!editing) return;
    await api.put("/admin/roles/" + editing.id, { permission_bits: editPerms, label: editing.label });
    const r = (await api.get<{ data: { list: Role[] } }>("/admin/roles")).data.data.list;
    setRoles(r);
    setEditing(null);
  }

  async function delRole(id: number) {
    if (!confirm("确认删除该自定义角色？")) return;
    await api.post("/admin/roles/" + id + "/delete", {});
    const r = (await api.get<{ data: { list: Role[] } }>("/admin/roles")).data.data.list;
    setRoles(r);
  }

  async function createRole() {
    if (!newName.trim() || !newLabel.trim()) return alert("名称和标签不能为空");
    await api.post("/admin/roles", { name: newName, label: newLabel, permission_bits: newBits });
    const r = (await api.get<{ data: { list: Role[] } }>("/admin/roles")).data.data.list;
    setRoles(r);
    setShowNew(false);
    setNewName(""); setNewLabel(""); setNewBits([]);
  }

  return (
    <div>
      {/* [?] 帮助弹窗 */}
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🔐</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>角色权限管理
          <span style={{ cursor: "help", fontSize: 14, marginLeft: 8 }} onClick={() => setHelp(!help)}>[?]</span>
        </span>
      </div>
      {help && (
        <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
          <strong>角色权限管理 [?]</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            <li>系统预设角色不可删除/编辑名称，只能调整权限位</li>
            <li>自定义角色可自由编辑名称、标签和权限</li>
            <li>权限 bitset 共 30 位，每位代表一个权限</li>
            <li>角色变更和分配记录会写入审计日志</li>
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 16 }}>
        {/* 角色列表 */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>角色列表
              <span style={{ cursor: "help", fontSize: 12, marginLeft: 6 }} onClick={() => setHelp(!help)}>[?]</span>
            </h3>
            <button onClick={() => setShowNew(true)} style={{ padding: "6px 16px", cursor: "pointer", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6 }}>+ 新增角色</button>
          </div>
          {showNew && (
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input placeholder="角色标识(英文)" value={newName} onChange={e => setNewName(e.target.value)} style={{ flex: 1, padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4 }} />
                <input placeholder="显示名称" value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ flex: 1, padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 12, marginBottom: 8 }}>勾选权限：</div>
              <PermCheckboxes tree={tree} bits={newBits} onChange={setNewBits} />
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button onClick={createRole} style={{ padding: "4px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>确认创建</button>
                <button onClick={() => setShowNew(false)} style={{ padding: "4px 12px", background: "#e2e8f0", border: "none", borderRadius: 4, cursor: "pointer" }}>取消</button>
              </div>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>名称</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>标签</th>
                <th style={{ padding: "8px 12px", textAlign: "center" }}>用户数</th>
                <th style={{ padding: "8px 12px", textAlign: "center" }}>系统</th>
                <th style={{ padding: "8px 12px", textAlign: "center" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: "8px 12px" }}>{r.label}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{r.user_count}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{r.is_system ? "✅" : ""}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <button onClick={() => toggleEdit(r)} style={{ padding: "2px 10px", cursor: "pointer", border: "1px solid #94a3b8", borderRadius: 4, background: "#fff", marginRight: 4 }}>
                      编辑权限
                      <span style={{ cursor: "help", fontSize: 10, marginLeft: 3, color: "#64748b" }}>[?]</span>
                    </button>
                    {!r.is_system && (
                      <button onClick={() => delRole(r.id)} style={{ padding: "2px 10px", cursor: "pointer", border: "1px solid #ef4444", borderRadius: 4, background: "#fff", color: "#dc2626" }}>
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 编辑面板 */}
        {editing && (
          <div style={{ width: 360, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, position: "sticky", top: 16, height: "fit-content" }}>
            <h4 style={{ margin: "0 0 8px" }}>编辑权限：{editing.label}
              <span style={{ cursor: "help", fontSize: 12, marginLeft: 6, color: "#64748b" }} onClick={() => setHelp(!help)}>[?]</span>
            </h4>
            <PermCheckboxes tree={tree} bits={editPerms} onChange={setEditPerms} />
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button onClick={saveEdit} style={{ padding: "6px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>保存</button>
              <button onClick={() => setEditing(null)} style={{ padding: "6px 16px", background: "#e2e8f0", border: "none", borderRadius: 4, cursor: "pointer" }}>取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 权限勾选组件 */
function PermCheckboxes({ tree, bits, onChange }: { tree: PermGroup[]; bits: number[]; onChange: (b: number[]) => void }) {
  const idxMap: Record<string, number> = { DASHBOARD_VIEW:0, USER_LIST_VIEW:1, USER_DETAIL_VIEW:2, LOG_VIEW:3, FINANCE_VIEW:4, VENDOR_VIEW:5, USER_CREATE:6, USER_EDIT:7, USER_DISABLE:8, USER_DELETE:9, USER_ROLE_ASSIGN:10, USER_PERM_OVERRIDE:11, BALANCE_VIEW:12, BALANCE_ADJUST:13, RECHARGE_MANAGE:14, REFUND_PROCESS:15, WITHDRAW_AUDIT:16, TICKET_VIEW:17, TICKET_REPLY:18, TICKET_STATUS:19, TICKET_ASSIGN:20, TICKET_DELETE:21, VENDOR_CREATE:22, VENDOR_EDIT:23, VENDOR_DISABLE:24, MODEL_MANAGE:25, CONFIG_VIEW:26, CONFIG_EDIT:27, ROLE_MANAGE:28, AUDIT_VIEW:29 };

  function toggle(key: string) {
    const bit = idxMap[key];
    if (bit === undefined) return;
    onChange(bits.includes(bit) ? bits.filter(b => b !== bit) : [...bits, bit]);
  }

  return (
    <div style={{ maxHeight: 400, overflowY: "auto", fontSize: 12 }}>
      {tree.map(g => (
        <div key={g.group} style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: "#475569", marginBottom: 4 }}>{g.group}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {g.permissions.map(p => {
              const bit = idxMap[p.key];
              return (
                <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", border: "1px solid #e2e8f0", borderRadius: 4, cursor: "pointer", background: bit !== undefined && bits.includes(bit) ? "#dbeafe" : "#fff" }}>
                  <input type="checkbox" checked={bit !== undefined && bits.includes(bit)} onChange={() => bit !== undefined && toggle(p.key)} />
                  {p.label}
                  {p.description ? <span title={p.description} style={{ cursor: "help", color: "#94a3b8" }}>[?]</span> : null}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

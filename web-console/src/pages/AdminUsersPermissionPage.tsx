import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge } from "@3cloud/shared-ui";

/**
 * §30 用户权限一览 —— 查看用户角色、权限详情、分配/移除角色
 */
interface User { id: number; email: string; username: string | null; role: string }
interface Role { id: number; name: string; label: string; permissions: number; is_system: boolean }
interface PermGroup { group: string; permissions: { key: string; label: string; granted: boolean }[] }

export default function AdminUsersPermissionPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [userRoles, setUserRoles] = useState<Role[]>([]);
  const [userPerms, setUserPerms] = useState<{ user: User; roles: Role[]; effective: string[]; tree: PermGroup[] } | null>(null);

  useEffect(() => {
    api.get<{ data: { list: User[] } }>("/admin/users?page_size=500").then(r => setUsers(r.data.data.list)).catch(() => {});
    api.get<{ data: { list: Role[] } }>("/admin/roles").then(r => setRoles(r.data.data.list));
  }, []);

  function loadUser(id: number) {
    setSelectedUser(id);
    api.get<{ data: { list: Role[] } }>("/admin/users/" + id + "/roles").then(r => setUserRoles(r.data.data.list));
    api.get<{ data: { user: User; roles: Role[]; effective: string[]; tree: PermGroup[] } }>("/admin/users/" + id + "/permissions/detail")
      .then(r => setUserPerms(r.data.data));
  }

  async function assign(userId: number, roleId: number) {
    await api.post("/admin/users/" + userId + "/roles/assign", { role_id: roleId });
    loadUser(userId);
  }

  async function remove(userId: number, roleId: number) {
    await api.post("/admin/users/" + userId + "/roles/remove", { role_id: roleId });
    loadUser(userId);
  }

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>
        用户权限一览
        <HelpIcon text="查看所有用户的角色分配情况。可分配/移除角色（角色合并生效权限），查看用户最终有效权限列表。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {/* 用户列表 */}
        <div style={{ flex: 1 }}>
          <h3 style={{ marginTop: 0 }}>用户列表</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--color-bg)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>ID</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>邮箱</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>用户名</th>
                <th style={{ padding: "8px 12px", textAlign: "center" }}>角色</th>
                <th style={{ padding: "8px 12px", textAlign: "center" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid var(--color-border)`, cursor: "pointer", background: selectedUser === u.id ? "#eef2ff" : undefined }} onClick={() => loadUser(u.id)}>
                  <td style={{ padding: "8px 12px" }}>{u.id}</td>
                  <td style={{ padding: "8px 12px" }}>{u.email}</td>
                  <td style={{ padding: "8px 12px" }}>{u.username ?? "-"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    {u.role ? <StatusBadge status={u.role === "admin" ? "danger" : "info"}>{u.role}</StatusBadge> : "-"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <button style={{ padding: "2px 10px", cursor: "pointer", border: `1px solid var(--color-border)`, borderRadius: 4, background: "var(--color-panel)" }}>查看权限</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 用户权限面板 */}
        {selectedUser && userPerms && (
          <div style={{ width: 380, background: "var(--color-panel)", border: `1px solid var(--color-border)`, borderRadius: 8, padding: 16, position: "sticky", top: 16, height: "fit-content" }}>
            <h4 style={{ margin: "0 0 4px" }}>{userPerms.user.email || userPerms.user.username}</h4>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>ID: {selectedUser}</div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>当前角色：</div>
              {userRoles.length === 0 ? <span style={{ fontSize: 12, color: "#94a3b8" }}>未分配角色</span> : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {userRoles.map(r => (
                    <span key={r.id} style={{ padding: "2px 8px", background: "#dbeafe", borderRadius: 4, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      {r.label}
                      <span style={{ cursor: "pointer", color: "var(--color-danger-text)" }} onClick={() => remove(selectedUser, r.id)}>✕</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>添加角色：</div>
              <select
                onChange={e => { const v = Number(e.target.value); if (v) assign(selectedUser, v); }}
                style={{ width: "100%", padding: "6px", border: `1px solid var(--color-border)`, borderRadius: 4 }}
                defaultValue=""
              >
                <option value="" disabled>选择角色...</option>
                {roles.filter(r => !userRoles.find(ur => ur.id === r.id)).map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>有效权限：</div>
              <div style={{ maxHeight: 300, overflowY: "auto", fontSize: 12 }}>
                {userPerms.tree.filter(g => g.permissions.some(p => p.granted)).map(g => (
                  <div key={g.group} style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: "#475569" }}>{g.group}</div>
                    <div>{g.permissions.filter(p => p.granted).map(p => p.label).join("、")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

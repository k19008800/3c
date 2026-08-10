import { useState, useEffect } from "react";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, useToast } from "@3cloud/shared-ui";

/**
 * §30 用户权限一览 —— 查看用户角色、权限详情、分配/移除角色
 */
interface User { id: number; email: string; username: string | null; role: string }
interface Role { id: number; name: string; label: string; permissions: number; is_system: boolean }
interface PermGroup { group: string; permissions: { key: string; label: string; granted: boolean }[] }

/* ───────── 演示数据（后端 /admin/users /admin/roles 待接入） ───────── */
const MOCK_USERS: User[] = [
  { id: 1, email: "admin@3cloud.dev", username: "管理员", role: "super_admin" },
  { id: 1001, email: "user1@example.com", username: "用户小王", role: "user" },
  { id: 1002, email: "user2@example.com", username: "用户小李", role: "user" },
  { id: 1003, email: "user3@example.com", username: "用户小张", role: "agent" },
];
const MOCK_ROLES: Role[] = [
  { id: 1, name: "super_admin", label: "超级管理员", permissions: 99, is_system: true },
  { id: 2, name: "admin", label: "管理员", permissions: 40, is_system: true },
  { id: 3, name: "agent", label: "代理商", permissions: 8, is_system: true },
  { id: 4, name: "sales", label: "业务员", permissions: 6, is_system: true },
  { id: 5, name: "finance", label: "财务审核员", permissions: 5, is_system: false },
];
const MOCK_PERMS_TREE: PermGroup[] = [
  { group: "客户管理", permissions: [ { key: "customer.view", label: "查看客户", granted: true }, { key: "customer.edit", label: "编辑客户", granted: true } ] },
  { group: "财务", permissions: [ { key: "finance.refund", label: "退款审核", granted: true }, { key: "finance.topup", label: "人工上账", granted: true } ] },
  { group: "系统", permissions: [ { key: "sys.config", label: "系统配置", granted: false } ] },
];

export default function AdminUsersPermissionPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [roles, setRoles] = useState<Role[]>(MOCK_ROLES);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [userRoles, setUserRoles] = useState<Role[]>([]);
  const [userPerms, setUserPerms] = useState<{ user: User; roles: Role[]; effective: string[]; tree: PermGroup[] } | null>(null);
  const [demo, setDemo] = useState(true);

  useEffect(() => {
    api.get<{ data: { list: User[] } }>("/admin/users?page_size=500").then(r => { setUsers(r.data.data.list); setDemo(false); }).catch(() => {});
    api.get<{ data: { list: Role[] } }>("/admin/roles").then(r => setRoles(r.data.data.list)).catch(() => {});
  }, []);

  function loadUser(id: number) {
    setSelectedUser(id);
    api.get<{ data: { list: Role[] } }>("/admin/users/" + id + "/roles").then(r => setUserRoles(r.data.data.list)).catch(() => {
      // 演示模式：后端未实现时本地构建
      if (demo) {
        const u = MOCK_USERS.find(x => x.id === id);
        const r = u?.role ? MOCK_ROLES.filter(x => x.name === u.role) : [];
        setUserRoles(r);
        setUserPerms({ user: u ?? { id, email: `user${id}@example.com`, username: `用户${id}`, role: "user" }, roles: r, effective: ["customer.view", "customer.edit", "finance.topup"], tree: MOCK_PERMS_TREE });
      }
    });
    api.get<{ data: { user: User; roles: Role[]; effective: string[]; tree: PermGroup[] } }>("/admin/users/" + id + "/permissions/detail")
      .then(r => setUserPerms(r.data.data))
      .catch(() => { /* 演示模式已在 roles 回调中兜底 */ });
  }

  async function assign(userId: number, roleId: number) {
    try {
      await api.post("/admin/users/" + userId + "/roles/assign", { role_id: roleId });
      toast.success("已分配角色");
      loadUser(userId);
    } catch (e: any) {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && demo) {
        const r = MOCK_ROLES.find(x => x.id === roleId);
        if (r) {
          setUserRoles(prev => prev.find(x => x.id === roleId) ? prev : [...prev, r]);
          setUserPerms(prev => prev ? { ...prev, roles: [...prev.roles.filter(x => x.id !== roleId), r], effective: [...new Set([...prev.effective, `role:${r.name}`])] } : prev);
        }
        toast.success("已分配角色（演示）");
      } else {
        toast.error(extractError(e));
      }
    }
  }

  async function remove(userId: number, roleId: number) {
    try {
      await api.post("/admin/users/" + userId + "/roles/remove", { role_id: roleId });
      toast.success("已移除角色");
      loadUser(userId);
    } catch (e: any) {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && demo) {
        setUserRoles(prev => prev.filter(r => r.id !== roleId));
        setUserPerms(prev => prev ? { ...prev, roles: prev.roles.filter(r => r.id !== roleId) } : prev);
        toast.success("已移除角色（演示）");
      } else {
        toast.error(extractError(e));
      }
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>
        用户权限一览
        <HelpIcon text="查看所有用户的角色分配情况。可分配/移除角色（角色合并生效权限），查看用户最终有效权限列表。" level="page" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/users 待接入）</span>}
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

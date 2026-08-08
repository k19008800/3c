import { useState, useEffect } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import { api, apiGet, apiPost, apiPut } from "../../services/api";

// ── Types ──
interface PermissionTreeItem {
  key: string;
  label: string;
  description?: string;
}

interface PermissionTreeGroup {
  group: string;
  groupIcon: string;
  permissions: PermissionTreeItem[];
}

interface ApiRole {
  id: number;
  name: string;
  label: string;
  description: string;
  permissions: number; // bitmask
  is_system: boolean;
  user_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface RoleUI {
  id: string;
  name: string;
  description: string;
  userCount: number;
  permissions: string[]; // key strings of active permissions
  createdAt: string;
  isSystem: boolean;
}

interface UserAssignment {
  id: string;
  username: string;
  email: string;
  role: string;
  roleId: string;
  assignedAt: string;
}

interface AuditLog {
  id: string;
  action: string;
  operator: string;
  target: string;
  detail: string;
  timestamp: string;
  ip: string;
}

// ── Bitset mapping (mirrors backend Perm enum) ──
const PERM_BITS: Record<string, number> = {
  DASHBOARD_VIEW: 0, USER_LIST_VIEW: 1, USER_DETAIL_VIEW: 2, LOG_VIEW: 3,
  FINANCE_VIEW: 4, VENDOR_VIEW: 5, USER_CREATE: 6, USER_EDIT: 7,
  USER_DISABLE: 8, USER_DELETE: 9, USER_ROLE_ASSIGN: 10, USER_PERM_OVERRIDE: 11,
  BALANCE_VIEW: 12, BALANCE_ADJUST: 13, RECHARGE_MANAGE: 14, REFUND_PROCESS: 15,
  WITHDRAW_AUDIT: 16, TICKET_VIEW: 17, TICKET_REPLY: 18, TICKET_STATUS: 19,
  TICKET_ASSIGN: 20, TICKET_DELETE: 21, VENDOR_CREATE: 22, VENDOR_EDIT: 23,
  VENDOR_DISABLE: 24, MODEL_MANAGE: 25, CONFIG_VIEW: 26, CONFIG_EDIT: 27,
  ROLE_MANAGE: 28, AUDIT_VIEW: 29,
};

function bitsToKeys(bits: number): string[] {
  return Object.entries(PERM_BITS)
    .filter(([, bit]) => (bits & (1 << bit)) !== 0)
    .map(([key]) => key);
}

function keysToBits(keys: string[]): number[] {
  return keys.map((k) => PERM_BITS[k]).filter((b) => b !== undefined);
}

// ── Component ──
export default function AdminRoles() {
  // State
  const [roles, setRoles] = useState<RoleUI[]>([]);
  const [permTree, setPermTree] = useState<PermissionTreeGroup[]>([]);
  const [allPermKeys, setAllPermKeys] = useState<string[]>([]);
  const [users] = useState<UserAssignment[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<"roles" | "users" | "audit">("roles");
  const [editRole, setEditRole] = useState<RoleUI | null>(null);
  const [newRole, setNewRole] = useState({ name: "", label: "", description: "", permissions: [] as string[] });
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Load data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesData, permData] = await Promise.all([
        apiGet<{ list: ApiRole[] }>("/admin/roles"),
        apiGet<{ tree: PermissionTreeGroup[]; all_bits: number }>("/admin/roles/permissions/list"),
      ]);
      const uiRoles: RoleUI[] = rolesData.list.map((r) => ({
        id: String(r.id),
        name: r.name,
        description: r.description || r.label,
        userCount: r.user_count,
        permissions: bitsToKeys(r.permissions),
        createdAt: r.created_at?.slice(0, 10) || "",
        isSystem: r.is_system,
      }));
      setRoles(uiRoles);
      setPermTree(permData.tree);
      const allKeys = permData.tree.flatMap((g) => g.permissions.map((p) => p.key));
      setAllPermKeys(allKeys);
    } catch (e: any) {
      setError(e.message || "加载角色数据失败");
    } finally {
      setLoading(false);
    }
  };

  // Load audit logs
  const loadAudit = async () => {
    try {
      const data = await apiGet<{ list: any[]; pagination: any }>("/admin/permission-audit-logs");
      const logs: AuditLog[] = data.list.map((l: any) => ({
        id: String(l.id),
        action: l.action || "",
        operator: l.operator_email || "",
        target: l.target_email || String(l.target_role_id || l.target_user_id || ""),
        detail: l.detail || "",
        timestamp: l.created_at || "",
        ip: l.ip || "—",
      }));
      setAudit(logs);
    } catch {
      // audit logs are optional; silently ignore
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === "audit") loadAudit();
  }, [activeTab]);

  // Actions
  const togglePermission = (permKey: string) => {
    setEditRole((prev) => {
      if (!prev) return prev;
      const has = prev.permissions.includes(permKey);
      return {
        ...prev,
        permissions: has ? prev.permissions.filter((k) => k !== permKey) : [...prev.permissions, permKey],
      };
    });
  };

  const toggleAllCategory = (catPerms: string[]) => {
    setEditRole((prev) => {
      if (!prev) return prev;
      const allHave = catPerms.every((k) => prev.permissions.includes(k));
      if (allHave) {
        return { ...prev, permissions: prev.permissions.filter((k) => !catPerms.includes(k)) };
      } else {
        return { ...prev, permissions: [...new Set([...prev.permissions, ...catPerms])] };
      }
    });
  };

  const saveRole = async () => {
    if (!editRole) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const bits = keysToBits(editRole.permissions);
      await apiPut(`/admin/roles/${editRole.id}`, {
        name: editRole.name,
        permission_bits: bits,
      });
      setSaveMsg("✅ 权限已保存");
      await loadData(); // refresh
      setEditRole(null);
    } catch (e: any) {
      setSaveMsg(`❌ ${e.message || "保存失败"}`);
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    if (!newRole.name.trim() || !newRole.label.trim()) return;
    setSaving(true);
    try {
      const bits = keysToBits(newRole.permissions);
      await apiPost("/admin/roles", {
        name: newRole.name,
        label: newRole.label,
        description: newRole.description,
        permission_bits: bits,
      });
      setNewRole({ name: "", label: "", description: "", permissions: [] });
      setShowCreate(false);
      await loadData();
    } catch (e: any) {
      alert(e.message || "创建失败");
    } finally {
      setSaving(false);
    }
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
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={loadData}>
            重试
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="page-title">
        角色权限管理
        <HelpModal title="角色权限管理">
          <p>管理系统角色和权限矩阵，分配用户角色，查看操作审计日志。</p>
          <p style={{ marginTop: 8 }}>⚙️ 三大功能：</p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li><strong>角色列表</strong>：创建/编辑角色，配置细粒度权限（bitset 引擎）</li>
            <li><strong>用户权限分配</strong>：查看已分配用户，调整角色映射</li>
            <li><strong>审计日志</strong>：追溯所有权限变更记录，包含操作人、IP、时间</li>
          </ul>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理角色定义、权限矩阵和用户授权</p>

      {/* Tabs */}
      <div className="filter-tabs mb-16">
        {(["roles", "users", "audit"] as const).map((tab) => (
          <button
            key={tab}
            className={`filter-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "roles" ? "角色列表" : tab === "users" ? "用户权限" : "审计日志"}
          </button>
        ))}
      </div>

      {/* Roles Tab */}
      {activeTab === "roles" && (
        <>
          <div className="flex-between mb-16">
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              共 {roles.length} 个角色
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              + 新建角色
            </button>
          </div>

          {roles.map((role) => (
            <div key={role.id} className="panel mb-16">
              <div className="panel-header">
                <div>
                  <strong>{role.name}</strong>
                  {role.isSystem && (
                    <span className="badge badge-info" style={{ marginLeft: 8 }}>系统</span>
                  )}
                  <span style={{ marginLeft: 12, fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {role.description}
                  </span>
                </div>
                <div className="flex-wrap">
                  <span className="badge badge-info">{role.userCount} 用户</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>创建于 {role.createdAt}</span>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setEditRole({ ...role })}
                    disabled={role.isSystem}
                    title={role.isSystem ? "系统角色不可编辑" : undefined}
                  >
                    编辑权限
                  </button>
                </div>
              </div>
              <div className="panel-body">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {allPermKeys.map((key) => {
                    const has = role.permissions.includes(key);
                    const label = permTree.flatMap((g) => g.permissions).find((p) => p.key === key)?.label || key;
                    return (
                      <span
                        key={key}
                        className={`badge ${has ? "badge-success" : "badge-danger"}`}
                        style={{ opacity: has ? 1 : 0.3, fontSize: 11 }}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Users Tab (TODO: needs per-role user endpoint integration) */}
      {activeTab === "users" && (
        <div className="panel">
          <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
            <div>
              用户权限分配需要按角色查询用户。
              <br />
              {/* TODO: integrate GET /admin/roles/users/:roleId */}
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                TODO: 集成 GET /admin/roles/users/:roleId 按角色查询已分配用户
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Audit Tab */}
      {activeTab === "audit" && (
        <div className="panel">
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作</th>
                  <th>操作人</th>
                  <th>目标</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {audit.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)" }}>
                      📋 暂无审计记录
                    </td>
                  </tr>
                ) : (
                  audit.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontSize: 12 }}>{a.timestamp}</td>
                      <td><span className="badge badge-info">{a.action}</span></td>
                      <td>{a.operator || "—"}</td>
                      <td>{a.target || "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--color-text-secondary)", maxWidth: 300 }}>{a.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Role Permission Modal */}
      {editRole && (
        <div className="modal-overlay" onClick={() => setEditRole(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 700 }}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>编辑权限 — {editRole.name}</h3>
              <button className="modal-close" onClick={() => setEditRole(null)}>✕</button>
            </div>
            <div className="modal-body">
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
              {permTree.map((cat) => {
                const catPerms = cat.permissions.map((p) => p.key);
                const allCat = catPerms.every((k) => editRole.permissions.includes(k));
                return (
                  <div key={cat.group} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <strong style={{ fontSize: 14 }}>{cat.group}</strong>
                      <button
                        className="btn btn-xs btn-secondary"
                        onClick={() => toggleAllCategory(catPerms)}
                      >
                        {allCat ? "取消全选" : "全选"}
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {cat.permissions.map((p) => {
                        const has = editRole.permissions.includes(p.key);
                        return (
                          <label
                            key={p.key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 12px",
                              borderRadius: "var(--radius-md)",
                              background: has ? "var(--color-primary-light)" : "var(--color-disabled-bg)",
                              cursor: "pointer",
                              fontSize: 13,
                            }}
                            title={p.description}
                          >
                            <input
                              type="checkbox"
                              checked={has}
                              onChange={() => togglePermission(p.key)}
                            />
                            {p.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditRole(null)}>取消</button>
              <button className="btn btn-primary" onClick={saveRole} disabled={saving}>
                {saving ? "保存中…" : "保存权限"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Role Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>新建角色</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">角色标识 (name) *</label>
                <input
                  className="form-input"
                  placeholder="例如：ops_manager"
                  value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">角色显示名 (label) *</label>
                <input
                  className="form-input"
                  placeholder="例如：运营经理"
                  value={newRole.label}
                  onChange={(e) => setNewRole({ ...newRole, label: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">角色描述</label>
                <textarea
                  className="form-textarea"
                  placeholder="描述该角色的职责和权限范围…"
                  value={newRole.description}
                  onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">权限选择</label>
                {permTree.map((cat) => {
                  const catKeys = cat.permissions.map((p) => p.key);
                  const allCat = catKeys.every((k) => newRole.permissions.includes(k));
                  return (
                    <div key={cat.group} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                        {cat.group}
                        <button
                          className="btn btn-xs btn-secondary"
                          onClick={() => {
                            setNewRole((prev) => {
                              if (allCat) return { ...prev, permissions: prev.permissions.filter((k) => !catKeys.includes(k)) };
                              return { ...prev, permissions: [...new Set([...prev.permissions, ...catKeys])] };
                            });
                          }}
                        >
                          {allCat ? "取消" : "全选"}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {cat.permissions.map((p) => (
                          <label
                            key={p.key}
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              padding: "4px 8px", borderRadius: "var(--radius-sm)",
                              background: newRole.permissions.includes(p.key) ? "var(--color-primary-light)" : "var(--color-disabled-bg)",
                              cursor: "pointer", fontSize: 12,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={newRole.permissions.includes(p.key)}
                              onChange={() => {
                                setNewRole((prev) => {
                                  const has = prev.permissions.includes(p.key);
                                  return {
                                    ...prev,
                                    permissions: has
                                      ? prev.permissions.filter((k) => k !== p.key)
                                      : [...prev.permissions, p.key],
                                  };
                                });
                              }}
                            />
                            {p.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={createRole} disabled={!newRole.name.trim() || !newRole.label.trim() || saving}>
                {saving ? "创建中…" : "创建角色"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

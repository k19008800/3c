import { useState, useCallback, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import EmptyState from "../../components/EmptyState";
import api from "../../services/api";

/* ==================== Types ==================== */

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "pending" | "inactive";
  joinedAt?: string;
  joined_at?: string;
}

type RoleLabel = Record<TeamMember["role"], string>;
const ROLE_LABELS: RoleLabel = {
  owner: "拥有者",
  admin: "管理员",
  member: "成员",
  viewer: "观察者",
};

const ROLE_OPTIONS: { value: TeamMember["role"]; label: string; desc: string }[] = [
  { value: "owner", label: "拥有者", desc: "完全控制权限，包括删除团队" },
  { value: "admin", label: "管理员", desc: "管理成员、API Key 和设置" },
  { value: "member", label: "成员", desc: "使用 API Key、查看消费数据" },
  { value: "viewer", label: "观察者", desc: "只读查看消费统计和日志" },
];

/* ==================== Nav ==================== */

const NAV = [
  { to: "/dashboard", icon: "📊", label: "概览" },
  { to: "/team", icon: "👥", label: "团队" },
  { to: "/webhooks", icon: "🔔", label: "Webhooks" },
  { to: "/logs", icon: "📋", label: "日志" },
  { to: "/settings", icon: "⚙️", label: "设置" },
  { to: "/account-deletion", icon: "🗑️", label: "账号注销" },
];

/* ==================== Component ==================== */

export default function Team() {
  const location = useLocation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamMember["role"]>("member");
  const [inviteError, setInviteError] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await api.get<TeamMember[]>("/me/team/members");
      if (error) throw new Error(error);
      setMembers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e.message || "加载团队成员失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setInviteError("请输入有效的邮箱地址");
      return;
    }
    setInviteSubmitting(true);
    try {
      const { error } = await api.post("/me/team/invite", {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      if (error) throw new Error(error);
      setInviteEmail("");
      setInviteRole("member");
      setInviteError("");
      setInviteOpen(false);
      showToast("邀请已发送");
      fetchMembers();
    } catch (e: any) {
      setInviteError(e.message || "邀请发送失败");
    } finally {
      setInviteSubmitting(false);
    }
  }, [inviteEmail, inviteRole, showToast, fetchMembers]);

  const handleRoleChange = useCallback(
    async (id: string, role: TeamMember["role"]) => {
      // Optimistic update
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, role } : m)),
      );
      setRoleOpen(null);
      try {
        await api.put(`/me/team/members/${id}/role`, { role });
        showToast("角色已更新");
      } catch (e: any) {
        showToast("角色更新失败");
        fetchMembers();
      }
    },
    [showToast, fetchMembers],
  );

  const handleRemove = useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(`确定要移除成员 ${name} 吗？`)) return;
      // Optimistic removal
      setMembers((prev) => prev.filter((m) => m.id !== id));
      try {
        await api.delete(`/me/team/members/${id}`);
        showToast("成员已移除");
      } catch (e: any) {
        showToast("移除成员失败");
        fetchMembers();
      }
    },
    [showToast, fetchMembers],
  );

  const statusBadgeStatus = (s: TeamMember["status"]): "active" | "pending" | "inactive" => s;
  const statusLabel = (s: TeamMember["status"]) =>
    s === "active" ? "活跃" : s === "pending" ? "待接受" : "已停用";
  const formatJoinedAt = (m: TeamMember) => m.joined_at || m.joinedAt || "";

  return (
    <div className="portal-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">3Cloud</div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-item${location.pathname === item.to ? " active" : ""}`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="portal-main">
        <PageHeader
          title="团队管理"
          helpText="管理团队成员、角色和权限。拥有者可邀请新成员并分配角色。"
          actions={
            <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
              + 邀请成员
            </button>
          }
        />

        {/* Member list */}
        {loading ? (
          <div className="card" style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
            <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
          </div>
        ) : loadError ? (
          <div className="card" style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <div style={{ color: "var(--color-text-secondary)" }}>{loadError}</div>
          </div>
        ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>成员</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>加入时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title="暂无团队成员" description="点击右上角按钮邀请成员加入团队" />
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="flex-row">
                          <div className="avatar-lg" style={{ width: 36, height: 36, fontSize: 14 }}>
                            {m.name?.[0] || "?"}
                          </div>
                          <div className="flex-col" style={{ gap: 2 }}>
                            <span style={{ fontWeight: 500 }}>{m.name}</span>
                            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                              {m.email}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ position: "relative" }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setRoleOpen(roleOpen === m.id ? null : m.id)}
                            disabled={m.role === "owner"}
                          >
                            {ROLE_LABELS[m.role] || m.role} ▾
                          </button>
                          {roleOpen === m.id && (
                            <div
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                background: "#fff",
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                zIndex: 20,
                                minWidth: 200,
                                padding: 8,
                                marginTop: 4,
                              }}
                            >
                              {ROLE_OPTIONS.filter((r) => r.value !== "owner").map(
                                (r) => (
                                  <div
                                    key={r.value}
                                    onClick={() => handleRoleChange(m.id, r.value)}
                                    style={{
                                      padding: "8px 12px",
                                      cursor: "pointer",
                                      borderRadius: 6,
                                      fontSize: 13,
                                      color:
                                        m.role === r.value
                                          ? "var(--color-primary)"
                                          : "var(--color-text)",
                                      background:
                                        m.role === r.value
                                          ? "rgba(79,110,247,0.08)"
                                          : "transparent",
                                    }}
                                    onMouseEnter={(e) => {
                                      (e.target as HTMLElement).style.background =
                                        "rgba(79,110,247,0.06)";
                                    }}
                                    onMouseLeave={(e) => {
                                      (e.target as HTMLElement).style.background =
                                        m.role === r.value
                                          ? "rgba(79,110,247,0.08)"
                                          : "transparent";
                                    }}
                                  >
                                    <div style={{ fontWeight: 500 }}>{r.label}</div>
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: "var(--color-text-secondary)",
                                      }}
                                    >
                                      {r.desc}
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={statusBadgeStatus(m.status)}>
                          {statusLabel(m.status)}
                        </StatusBadge>
                      </td>
                      <td style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
                        {formatJoinedAt(m)}
                      </td>
                      <td>
                        {m.role !== "owner" && (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ color: "#ef4444", borderColor: "#ef4444" }}
                            onClick={() => handleRemove(m.id, m.name)}
                          >
                            移除
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Invite Modal */}
        <Modal
          open={inviteOpen}
          onClose={() => {
            setInviteOpen(false);
            setInviteError("");
          }}
          title="邀请成员"
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setInviteOpen(false);
                  setInviteError("");
                }}
              >
                取消
              </button>
              <button className="btn btn-primary" onClick={handleInvite} disabled={inviteSubmitting}>
                {inviteSubmitting ? "发送中..." : "发送邀请"}
              </button>
            </>
          }
        >
          {inviteError && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: "8px 12px",
                borderRadius: 6,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              {inviteError}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">
              邮箱地址 <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="email"
              className="form-input"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">角色</label>
            <select
              className="form-input"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamMember["role"])}
            >
              {ROLE_OPTIONS.filter((r) => r.value !== "owner").map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.desc}
                </option>
              ))}
            </select>
          </div>
        </Modal>

        {/* Toast */}
        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}

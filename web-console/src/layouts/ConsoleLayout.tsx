import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Console 主布局：侧边栏 + 顶栏 + 内容区
 */
export default function ConsoleLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  // 公告未读数
  const unreadQ = useQuery({
    queryKey: ["me-announcements-unread"],
    queryFn: async () => (await api.get<{ data: { unread: number } }>("/me/announcements/unread-count")).data.data,
    refetchInterval: 60000,
  });

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems = [
    { to: "/", label: "仪表盘", end: true },
    { to: "/api-keys", label: "API Keys" },
    { to: "/logs", label: "调用日志" },
    { to: "/recharge", label: "充值中心" },
    { to: "/billing", label: "账单中心" },
    { to: "/invoices", label: "发票开具" },
    { to: "/redemption", label: "兑换中心" },
    { to: "/announcements", label: "公告" },
    { to: "/real-name", label: "实名认证" },
    { to: "/notification", label: "通知设置" },
    { to: "/agent/settings", label: "代理设置" },
  ];
  // 管理入口（admin / super_admin 可见）
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* 侧边栏 */}
      <aside style={{ width: 200, background: "#1e293b", color: "#fff", padding: "16px 0" }}>
        <div style={{ padding: "0 20px 16px", fontWeight: 700, fontSize: 18 }}>3Cloud 控制台</div>
        <nav style={{ display: "flex", flexDirection: "column" }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: "10px 20px",
                color: isActive ? "#38bdf8" : "#cbd5e1",
                textDecoration: "none",
                background: isActive ? "#0f172a" : "transparent",
                borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
              })}
            >
              {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <>
              <div style={{ padding: "16px 20px 6px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                管理后台
              </div>
              <NavLink
                to="/admin/agents"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                代理管理
              </NavLink>
              <NavLink
                to="/admin/withdrawals"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                提现审核
              </NavLink>
              <NavLink
                to="/admin/vendors"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                供应商管理
              </NavLink>
              <NavLink
                to="/admin/vendor-settlements"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                供应商结算
              </NavLink>
              <NavLink
                to="/admin/models"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                模型管理
              </NavLink>
              <NavLink
                to="/admin/invoices"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                税票管理
              </NavLink>
              <NavLink
                to="/admin/real-name"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                实名审核
              </NavLink>
              <NavLink
                to="/admin/redemption"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                兑换码
              </NavLink>
              <NavLink
                to="/admin/announcements"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                公告管理
              </NavLink>
              <NavLink
                to="/admin/campaigns"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                营销活动
              </NavLink>
              <NavLink
                to="/admin/email-templates"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                邮件模板
              </NavLink>
              <NavLink
                to="/admin/activity"
                style={({ isActive }) => ({
                  padding: "10px 20px",
                  color: isActive ? "#38bdf8" : "#cbd5e1",
                  textDecoration: "none",
                  background: isActive ? "#0f172a" : "transparent",
                  borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
                })}
              >
                实时活动流
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      {/* 主区 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            height: 56,
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 24px",
            gap: 16,
          }}
        >
          <span>
            余额: <strong>¥{((user?.balance ?? 0) / 100).toFixed(2)}</strong>
          </span>
          <span>{user?.username ?? user?.email}</span>
          <Link to="/announcements" style={{ position: "relative", textDecoration: "none", fontSize: 20, cursor: "pointer" }} title="公告">
            📢
            {unreadQ.data?.unread ? (
              <span style={{ position: "absolute", top: -6, right: -12, background: "#dc2626", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 11, minWidth: 18, textAlign: "center" }}>
                {unreadQ.data.unread > 99 ? "99+" : unreadQ.data.unread}
              </span>
            ) : null}
          </Link>
          <button onClick={handleLogout} style={{ cursor: "pointer", padding: "6px 12px" }}>
            退出
          </button>
        </header>
        <main style={{ padding: 24, flex: 1, background: "#f8fafc" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

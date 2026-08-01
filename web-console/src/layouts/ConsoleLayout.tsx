import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

/**
 * Console 主布局：侧边栏 + 顶栏 + 内容区
 */
export default function ConsoleLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

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
    { to: "/agent/settings", label: "代理设置" },
  ];

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

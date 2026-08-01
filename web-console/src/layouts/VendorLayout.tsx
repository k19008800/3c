import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useVendorAuthStore } from "../store/vendor-auth";

/**
 * 供应商自助端布局（深色主题，独立于用户 Console）
 * 侧边栏：仪表盘 / 模型管理 / 数据统计 / 结算对账 / 公告
 */
export default function VendorLayout() {
  const token = useVendorAuthStore((s) => s.token);
  const vendorLogout = useVendorAuthStore((s) => s.vendorLogout);

  if (!token) return <Navigate to="/vendor/login" replace />;

  const items = [
    { to: "/vendor", label: "仪表盘", end: true },
    { to: "/vendor/models", label: "模型管理" },
    { to: "/vendor/stats", label: "数据统计" },
    { to: "/vendor/settlements", label: "结算对账" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "#f1f5f9" }}>
      <aside style={{ width: 200, background: "#0f172a", color: "#fff", padding: "16px 0", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 20px 16px", fontWeight: 700, fontSize: 16 }}>🏭 供应商平台</div>
        <nav style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: "10px 20px",
                color: isActive ? "#38bdf8" : "#cbd5e1",
                textDecoration: "none",
                background: isActive ? "#1e293b" : "transparent",
                borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #1e293b" }}>
          <button onClick={vendorLogout} style={{ width: "100%", padding: 8, background: "none", border: "1px solid #334155", color: "#94a3b8", borderRadius: 6, cursor: "pointer" }}>退出登录</button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}

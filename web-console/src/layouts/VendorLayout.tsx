import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useVendorAuthStore } from "../store/vendor-auth";
import "@3cloud/shared-ui/src/admin-system.css";

/**
 * 供应商自助端布局（墨蓝暗底，与 ConsoleLayout 同一令牌体系）
 * 侧边栏：仪表盘 / 模型管理 / 数据统计 / 结算对账 / 退出登录
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
    <div className="c3-shell" style={{ background: "var(--color-bg)" }}>
      <aside className="c3-sidebar c3-sidebar--inflow" style={{ width: 220, flexShrink: 0 }}>
        <div className="c3-sidebar__logo">
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M3 21V10l6 4v-4l6 4V4h6v17H3z" />
            <path d="M17 8h2M17 12h2M17 16h2" />
          </svg>供应商平台
        </div>
        <nav style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? "c3-sidebar__sublink c3-sidebar__sublink--active" : "c3-sidebar__sublink"
              }
              style={{ paddingLeft: 20 }}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-sidebar-divider)" }}>
          <button
            onClick={vendorLogout}
            style={{
              width: "100%", padding: 8, background: "none",
              border: "1px solid var(--color-border-inverse)", borderRadius: 6,
              color: "var(--color-text-inverse-secondary)", cursor: "pointer",
            }}
          >
            退出登录
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}

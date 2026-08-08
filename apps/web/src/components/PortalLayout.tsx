import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/dashboard", icon: "📊", label: "概览" },
  { to: "/billing", icon: "💰", label: "消费" },
  { to: "/api-keys", icon: "🔑", label: "API Key" },
  { to: "/playground", icon: "🧪", label: "Playground" },
  { to: "/profile", icon: "👤", label: "个人中心" },
  { to: "/security", icon: "🔒", label: "安全设置" },
  { to: "/notifications", icon: "🔔", label: "通知中心" },
  { to: "/invoices", icon: "🧾", label: "发票管理" },
  { to: "/recharge", icon: "💳", label: "充值" },
  { to: "/tickets", icon: "🎫", label: "工单" },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="portal-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">3Cloud</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-item${pathname === item.to ? " active" : ""}`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="portal-main">{children}</main>
    </div>
  );
}

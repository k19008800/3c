import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const AGENT_NAV = [
  { to: "/agent/dashboard", icon: "🏠", label: "工作台" },
  { to: "/agent/customers", icon: "👥", label: "我的客户" },
  { to: "/agent/consumption", icon: "📊", label: "客户消费" },
  { to: "/agent/commission", icon: "💰", label: "我的佣金" },
  { to: "/agent/withdraw", icon: "🏦", label: "提现管理" },
];

export default function AgentLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="portal-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">3Cloud 代理商</div>
        <nav className="sidebar-nav">
          {AGENT_NAV.map((item) => (
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

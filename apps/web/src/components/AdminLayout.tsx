import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

interface MenuItem {
  label: string;
  icon: string;
  path?: string;
  children?: MenuItem[];
}

const ADMIN_MENU: MenuItem[] = [
  {
    label: "仪表盘",
    icon: "📊",
    children: [
      { label: "数据驾驶舱", icon: "🖥️", path: "/admin/cockpit" },
    ],
  },
  {
    label: "配置管理",
    icon: "⚙️",
    children: [
      { label: "模型服务管理", icon: "🔌", path: "/admin/model-service" },
      { label: "角色权限管理", icon: "👥", path: "/admin/roles" },
      { label: "邮件模板", icon: "📧", path: "/admin/email-templates" },
      { label: "运维配置", icon: "🔧", path: "/admin/ops" },
      { label: "风控管理", icon: "🛡️", path: "/admin/risk" },
      { label: "优惠券管理", icon: "🎫", path: "/admin/coupon" },
      { label: "内容管理", icon: "📝", path: "/admin/content" },
    ],
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () => {
      const active = ADMIN_MENU.find((g) =>
        g.children?.some((c) => c.path === location.pathname)
      );
      return active ? { [active.label]: true } : {};
    }
  );

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <Link to="/admin/cockpit" className="admin-sidebar-logo">
          3Cloud Admin
        </Link>
        <nav className="admin-sidebar-nav">
          {ADMIN_MENU.map((group) => {
            const expanded = expandedGroups[group.label] ?? false;
            return (
              <div key={group.label} className="admin-nav-group">
                <button
                  className={`admin-nav-group-header${expanded ? " active" : ""}`}
                  onClick={() => toggleGroup(group.label)}
                >
                  <span className="group-icon">{group.icon}</span>
                  <span className="group-label">{group.label}</span>
                  <span className={`group-arrow${expanded ? " open" : ""}`}>▸</span>
                </button>
                {expanded && group.children && (
                  <div className="admin-nav-sub">
                    {group.children.map((item) => {
                      const active = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path!}
                          className={`admin-nav-item${active ? " active" : ""}`}
                        >
                          <span className="sub-icon">{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="admin-content">{children}</main>
    </div>
  );
}

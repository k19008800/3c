/**
 * PortalSidebar — fixed left sidebar matching portal-common.css
 */
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/dashboard", icon: "📊", label: "控制台" },
  { href: "/statistics", icon: "📊", label: "消费明细" },
  { href: "/apikey", icon: "🔑", label: "API Key" },
  { href: "/recharge", icon: "💰", label: "充值" },
  { href: "/topup-record", icon: "📋", label: "充值记录" },
  { href: "/invoice", icon: "🧾", label: "发票" },
  { href: "/ticket", icon: "🎫", label: "工单中心" },
  { href: "/security", icon: "🔒", label: "账户安全" },
  { href: "/realname", icon: "✅", label: "实名认证" },
  { href: "/notifications", icon: "🔔", label: "通知中心" },
  { href: "/user-groups", icon: "📁", label: "模型分组" },
];

export default function PortalSidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width: collapsed ? 60 : "var(--sidebar-width)",
        background: "var(--sidebar-bg)",
        padding: "20px 0",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        transition: "width var(--transition-fast)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "var(--sidebar-logo-padding)",
          borderBottom: "1px solid var(--color-sidebar-divider)",
          fontSize: collapsed ? 14 : 18,
          fontWeight: 600,
          color: "var(--color-sidebar-logo)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 22 }}>🚀</span>
        {!collapsed && "3cloud"}
      </div>
      <nav style={{ marginTop: 8, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sidebar-nav-gap)",
                padding: "var(--sidebar-nav-padding)",
                fontSize: collapsed ? 0 : 14,
                cursor: "pointer",
                color: isActive ? "var(--color-sidebar-active)" : "var(--color-sidebar-text)",
                background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                borderRight: isActive ? "var(--sidebar-active-border)" : "3px solid transparent",
                textDecoration: "none",
                transition: "all var(--transition-fast)",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.background = "var(--sidebar-hover-bg)";
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: collapsed ? 14 : 16 }}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

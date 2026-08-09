import { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import ConsentBanner from "../components/ConsentBanner";

type NavItem = { to: string; label: string; icon: string };
type NavGroup = { group: string; icon: string; items: NavItem[] };

const ADMIN_NAV: NavGroup[] = [
  { group: "客户管理", icon: "👥", items: [
    { to: "/admin/customers", label: "客户列表", icon: "📋" },
    { to: "/admin/customers", label: "客户详情", icon: "👤" },
    { to: "/admin/customers/quotas", label: "额度管理", icon: "🪙" },
    { to: "/admin/customers/verifications", label: "实名认证审核", icon: "🆔" },
  ]},
  { group: "财务结算", icon: "💰", items: [
    { to: "/admin/finance/dashboard", label: "财务工作台", icon: "🏦" },
    { to: "/admin/finance/manual-topup", label: "人工上账", icon: "✋" },
    { to: "/admin/finance/adjust", label: "手动调账", icon: "⚖️" },
    { to: "/admin/finance/orders", label: "充值订单", icon: "🧾" },
    { to: "/admin/finance/commissions", label: "佣金流水", icon: "💸" },
    { to: "/admin/finance/refunds", label: "退款审核", icon: "↩️" },
    { to: "/admin/finance/invoices", label: "发票审核", icon: "📄" },
    { to: "/admin/finance/withdrawals", label: "提现管理", icon: "💳" },
    { to: "/admin/finance/coupons", label: "兑换码管理", icon: "🎟️" },
    { to: "/admin/finance/reconciliation", label: "对账报表", icon: "📊" },
    { to: "/admin/finance/cost-dashboard", label: "成本看板", icon: "📉" },
    { to: "/admin/finance/cost-prediction", label: "成本预测", icon: "🔮" },
    { to: "/admin/finance/settlement", label: "结算对账", icon: "⚖️" },
    { to: "/admin/finance/profit", label: "利润分析", icon: "📈" },
    { to: "/admin/finance/pricing", label: "价格管理", icon: "🏷️" },
  ]},
  { group: "供应商管理", icon: "🔌", items: [
    { to: "/admin/suppliers", label: "供应商列表", icon: "📋" },
    { to: "/admin/suppliers", label: "供应商详情", icon: "🔍" },
    { to: "/admin/suppliers/model-service", label: "模型服务管理", icon: "🎛️" },
    { to: "/admin/suppliers/vendor-profiles", label: "厂商资料管理", icon: "🏢" },
    { to: "/admin/suppliers/vendor-pricing", label: "厂商定价管理", icon: "💰" },
    { to: "/admin/suppliers/vendor-cost", label: "供应商成本管理", icon: "📦" },
    { to: "/admin/suppliers/vendor-stats", label: "用户选购统计", icon: "📊" },
    { to: "/admin/suppliers/price-change", label: "价格变更通知", icon: "📢" },
    { to: "/admin/suppliers/vendor-performance", label: "供应商绩效", icon: "🏆" },
  ]},
  { group: "代理商管理", icon: "🤝", items: [
    { to: "/admin/agents", label: "代理商列表", icon: "📋" },
    { to: "/admin/agents", label: "代理商详情", icon: "🔍" },
    { to: "/admin/agents/commission-config", label: "佣金配置", icon: "⚙️" },
    { to: "/admin/agents/withdrawals", label: "提现记录", icon: "💳" },
  ]},
  { group: "模型管理", icon: "🤖", items: [
    { to: "/admin/models/marketplace", label: "模型市场", icon: "📈" },
  ]},
  { group: "营销推广", icon: "📢", items: [
    { to: "/admin/marketing/affiliate", label: "推荐返利", icon: "💰" },
  ]},
  { group: "工单客服", icon: "🎫", items: [
    { to: "/admin/tickets", label: "工单列表+处理", icon: "📋" },
  ]},
  { group: "系统设置", icon: "⚙️", items: [
    { to: "/admin/settings/announcements", label: "公告管理", icon: "📢" },
    { to: "/admin/settings/roles", label: "角色权限", icon: "🛡️" },
    { to: "/admin/settings/i18n", label: "国际化翻译", icon: "🌐" },
  ]},
  { group: "运维配置", icon: "🛠", items: [
    { to: "/admin/config/system", label: "系统行为", icon: "⚡" },
    { to: "/admin/config/monitoring", label: "监控与警报", icon: "🔔" },
    { to: "/admin/config/performance", label: "性能配置", icon: "🐌" },
    { to: "/admin/config/webhook-retry", label: "Webhook 重试", icon: "🔄" },
    { to: "/admin/config/undo", label: "撤销操作日志", icon: "↩️" },
    { to: "/admin/config/smtp", label: "SMTP 邮箱", icon: "📧" },
    { to: "/admin/config/logs", label: "日志维护", icon: "📝" },
    { to: "/admin/config/maintenance", label: "系统维护", icon: "🔧" },
    { to: "/admin/config/site", label: "站点设置", icon: "🌐" },
    { to: "/admin/config/rate-limit", label: "限流设置", icon: "🚦" },
    { to: "/admin/config/email-templates", label: "邮件模板", icon: "📰" },
    { to: "/admin/config/content", label: "内容管理", icon: "📄" },
    { to: "/admin/config/oauth", label: "OAuth 配置", icon: "🔑" },
  ]},
  { group: "审计合规", icon: "🔍", items: [
    { to: "/admin/audit/login-logs", label: "登录日志", icon: "📱" },
    { to: "/admin/audit/operations", label: "操作审计", icon: "📋" },
    { to: "/admin/audit/api-logs", label: "API 调用日志", icon: "🔌" },
  ]},
  { group: "风控合规", icon: "🚨", items: [
    { to: "/admin/risk/dashboard", label: "风控看板", icon: "📊" },
    { to: "/admin/risk/rules", label: "风控规则配置", icon: "📏" },
    { to: "/admin/risk/events", label: "风控事件管理", icon: "📋" },
    { to: "/admin/risk/blocks", label: "冻结/解冻管理", icon: "⛔" },
  ]},
];

const SALES_NAV: NavItem[] = [
  { to: "/sales/customers", label: "客户管理", icon: "👥" },
  { to: "/sales/reminders", label: "跟进提醒", icon: "⏰" },
  { to: "/sales/performance", label: "业绩看板", icon: "📊" },
];

const PORTAL_NAV: NavItem[] = [
  { to: "/", label: "仪表盘", icon: "📊" },
  { to: "/api-keys", label: "API Keys", icon: "🔑" },
  { to: "/logs", label: "调用日志", icon: "📋" },
  { to: "/recharge", label: "充值中心", icon: "💰" },
  { to: "/topup-records", label: "充值记录", icon: "📋" },
  { to: "/billing", label: "账单中心", icon: "📄" },
  { to: "/invoices", label: "发票开具", icon: "🧾" },
  { to: "/redemption", label: "兑换中心", icon: "🎟️" },
  { to: "/announcements", label: "公告", icon: "📢" },
  { to: "/real-name", label: "实名认证", icon: "🆔" },
  { to: "/notification", label: "通知设置", icon: "🔔" },
  { to: "/tickets", label: "我的工单", icon: "🎫" },
  { to: "/chat", label: "在线客服", icon: "💬" },
  { to: "/security", label: "安全中心", icon: "🛡️" },
  { to: "/data-export", label: "数据导出", icon: "📦" },
  { to: "/user-groups", label: "用户组", icon: "👥" },
  { to: "/vendor-selector", label: "供应商选品", icon: "🏭" },
  { to: "/account-deletion", label: "账号注销", icon: "🗑️" },
];

const AGENT_NAV: NavItem[] = [
  { to: "/agent/dashboard", label: "代理工作台", icon: "📈" },
  { to: "/agent/commission", label: "佣金记录", icon: "💰" },
  { to: "/agent/consumption", label: "客户消费", icon: "📊" },
  { to: "/agent/customers", label: "我的客户", icon: "👥" },
  { to: "/agent/invite", label: "邀请客户", icon: "🔗" },
  { to: "/agent/ranking", label: "业绩排行", icon: "🏆" },
  { to: "/agent/withdraw", label: "提现管理", icon: "💳" },
  { to: "/agent/settings", label: "代理设置", icon: "🏢" },
  { to: "/agent/settlements", label: "结算对账", icon: "📑" },
];

export default function ConsoleLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const unreadQ = useQuery({
    queryKey: ["me-announcements-unread"],
    queryFn: async () => (await api.get("/me/announcements/unread-count")).data.data?.unread ?? 0,
    refetchInterval: 60000,
  });

  const toggleGroup = (name: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSales = user?.role === "sales";
  const isAgent = user?.role === "agent";
  const roleLabel = isAdmin ? "ADMIN" : isAgent ? "AGENT" : isSales ? "SALES" : "";

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-family)" }}>
      <aside style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 220, background: "#13151e", padding: "20px 0", zIndex: 100, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 18, fontWeight: 600, color: "#e0e0e0", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>⚡</span>3Cloud Admin
        </div>
        <nav style={{ flex: 1, overflowY: "auto", marginTop: 4 }}>
          {/* ── Admin ── */}
          {isAdmin && <>
            <SidebarLink to="/admin/cockpit" icon="🚀" label="数据驾驶舱" />
            <SidebarLink to="/admin/dashboard" icon="📊" label="业务看板" />
            {ADMIN_NAV.map(g => (
              <div key={g.group}>
                <div onClick={() => toggleGroup(g.group)} style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#666", cursor: "pointer", userSelect: "none" }}>
                  <span>{g.icon}</span><span style={{ flex: 1 }}>{g.group}</span>
                  <span style={{ fontSize: 10, transform: collapsed.has(g.group) ? "rotate(0deg)" : "rotate(90deg)", transition: "transform .2s" }}>▶</span>
                </div>
                {!collapsed.has(g.group) && g.items.map(item => (
                  <SidebarSubLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
                ))}
              </div>
            ))}
          </>}

          {/* ── Agent ── */}
          {isAgent && AGENT_NAV.map(item => <SidebarLink key={item.to} to={item.to} icon={item.icon} label={item.label} />)}

          {/* ── Sales ── */}
          {isSales && <>
            <div style={{ padding: "16px 20px 6px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>业务员工作台</div>
            {SALES_NAV.map(item => <SidebarLink key={item.to} to={item.to} icon={item.icon} label={item.label} />)}
          </>}

          {/* ── User portal ── */}
          {!isAdmin && !isAgent && !isSales && PORTAL_NAV.map(item => <SidebarLink key={item.to} to={item.to} icon={item.icon} label={item.label} />)}
        </nav>
      </aside>

      <div style={{ marginLeft: 220, flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#888" }}>{user?.email}</span>
            {roleLabel && <span style={{ background: "#eef2ff", color: "#4f6ef7", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{roleLabel}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "#888" }}>
            <span style={{ cursor: "pointer", color: "#6a8aff", fontWeight: 500 }} onClick={() => navigate("/recharge")}>余额: ¥{((user?.balance ?? 0) / 100).toFixed(2)}</span>
            <Link to="/announcements" style={{ position: "relative", fontSize: 18, cursor: "pointer", textDecoration: "none" }}>🔔{unreadQ.data ? <span style={{ position: "absolute", top: -4, right: -8, background: "#e53935", color: "#fff", fontSize: 10, width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadQ.data > 99 ? "99+" : unreadQ.data}</span> : null}</Link>
            <button onClick={() => { logout(); navigate("/login"); }} style={{ background: "none", border: "none", color: "#888", fontSize: 13, cursor: "pointer" }}>退出</button>
          </div>
        </div>
        <main style={{ padding: "0 24px 20px", flex: 1, background: "#f0f2f5" }}>
          <ConsentBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarLink({ to, icon, label }: NavItem) {
  return <NavLink to={to} end={to === "/"} style={({ isActive }) => ({ padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: isActive ? "#6a8aff" : "#666", textDecoration: "none", background: isActive ? "rgba(79,110,247,.12)" : "transparent", borderRight: isActive ? "3px solid #6a8aff" : "3px solid transparent", transition: "background .15s, color .15s" })}>
    <span style={{ fontSize: 16 }}>{icon}</span>{label}
  </NavLink>;
}

function SidebarSubLink({ to, icon, label }: NavItem) {
  return <NavLink to={to} style={({ isActive }) => ({ padding: "10px 20px 10px 48px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: isActive ? "#6a8aff" : "#666", textDecoration: "none", background: isActive ? "rgba(79,110,247,.12)" : "transparent", borderRight: isActive ? "3px solid #6a8aff" : "3px solid transparent", transition: "background .15s, color .15s" })}>
    <span style={{ fontSize: 12 }}>{icon}</span>{label}
  </NavLink>;
}

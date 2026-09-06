import { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { usePerm } from "../lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n-context";
import { CONSOLE_LANGS, type I18nLang } from "../lib/i18n";
import { fmtMoney } from "../lib/fmt";
import ConsentBanner from "../components/ConsentBanner";
import { PageHeaderProvider, usePageHeader, HelpIcon } from "@3cloud/shared-ui";
import "@3cloud/shared-ui/src/admin-system.css";

type NavItem = { to: string; label: string; icon: string; permKey?: string };
type NavGroup = { group: string; icon: string; items: NavItem[] };

const ADMIN_NAV: NavGroup[] = [
  { group: "客户管理", icon: "👥", items: [
    // 注：原型客户管理组无「客户详情」菜单项（详情由列表「查看」进入），此处不挂 /admin/customers/:userId
    { to: "/admin/customers", label: "客户列表", icon: "📋" },
    { to: "/admin/customers/quotas", label: "额度管理", icon: "🪙" },
    { to: "/admin/customers/verifications", label: "实名认证审核", icon: "🆔" },
    // 数据导出授权管理（PRD §5.2）：按用户维度定向授权，挂在客户管理组
    { to: "/admin/config/data-export-grants", label: "数据导出授权", icon: "📦", permKey: "dataExportGrant.view" },
  ]},
  { group: "财务结算", icon: "💰", items: [
    { to: "/admin/finance/dashboard", label: "财务工作台", icon: "🏦" },
    { to: "/admin/finance/accounts", label: "资金账户", icon: "💰" },
    { to: "/admin/finance/close", label: "结账管理", icon: "🔒" },
    { to: "/admin/finance/manual-topup", label: "人工上账", icon: "✋" },
    { to: "/admin/finance/adjust", label: "手动调账", icon: "⚖️" },
    { to: "/admin/finance/orders", label: "充值订单", icon: "🧾" },
    { to: "/admin/finance/commissions", label: "佣金流水", icon: "💸" },
    { to: "/admin/finance/refunds", label: "退款审核", icon: "↩️" },
    { to: "/admin/finance/invoices", label: "发票审核", icon: "📄" },
    { to: "/admin/finance/withdrawals", label: "提现管理", icon: "💳" },
    { to: "/admin/finance/coupons", label: "兑换码管理", icon: "🎟️" },
    { to: "/admin/finance/reconciliation", label: "对账报表", icon: "📊" },
    { to: "/admin/finance/reconciliation-diff", label: "对账差异", icon: "🔀" },
    { to: "/admin/finance/discount-engine", label: "折扣规则引擎", icon: "🎫" },
    { to: "/admin/finance/tax-banking", label: "税负与银行账户", icon: "🏦" },
    { to: "/admin/finance/supplier-bill-match", label: "供应商账单核对", icon: "🧾" },
    { to: "/admin/finance/cost-dashboard", label: "成本看板", icon: "📉" },
    { to: "/admin/finance/cost-prediction", label: "成本预测", icon: "🔮" },
    { to: "/admin/finance/settlement", label: "结算对账", icon: "⚖️" },
    { to: "/admin/finance/profit", label: "利润分析", icon: "📈" },
    { to: "/admin/finance/pricing", label: "价格管理", icon: "🏷️" },
    { to: "/admin/finance/risk-config", label: "风控规则配置", icon: "🛡️" },
  ]},
  { group: "供应商管理", icon: "🔌", items: [
    // 注：详情由列表进入，不挂参数化菜单 /admin/suppliers/:id
    { to: "/admin/suppliers", label: "供应商列表", icon: "📋" },
    { to: "/admin/suppliers/model-service", label: "模型服务管理", icon: "🎛️" },
    { to: "/admin/suppliers/vendor-profiles", label: "厂商资料管理", icon: "🏢" },
    { to: "/admin/suppliers/vendor-pricing", label: "厂商定价管理", icon: "💰" },
    { to: "/admin/suppliers/vendor-cost", label: "供应商成本管理", icon: "📦" },
    { to: "/admin/suppliers/vendor-stats", label: "用户选购统计", icon: "📊" },
    { to: "/admin/suppliers/price-change", label: "价格变更通知", icon: "📢" },
    { to: "/admin/suppliers/vendor-performance", label: "供应商绩效", icon: "🏆" },
    { to: "/admin/suppliers/multimodal-models", label: "多模态模型管理", icon: "🎛️" },
    { to: "/admin/suppliers/competitive-monitor", label: "竞品价格监控", icon: "🔍" },
  ]},
  { group: "消费运营", icon: "📊", items: [
    { to: "/admin/consumption/tracking", label: "消费明细追踪", icon: "🔍" },
    { to: "/admin/consumption/stream", label: "实时消费流水", icon: "📡" },
    { to: "/admin/consumption/anomaly", label: "消费异常检测", icon: "🚨" },
    { to: "/admin/consumption/balance-alert", label: "余额预警管理", icon: "⚠️" },
  ]},
  { group: "客户分析", icon: "📈", items: [
    { to: "/admin/analytics/funnel", label: "转化漏斗分析", icon: "📊" },
    { to: "/admin/analytics/success", label: "客户成功看板", icon: "🎯" },
  ]},
  { group: "代理商管理", icon: "🤝", items: [
    // 注：详情由列表进入，不挂参数化菜单 /admin/agents/:id
    { to: "/admin/agents", label: "代理商列表", icon: "📋" },
    { to: "/admin/agents/commission-config", label: "佣金配置", icon: "⚙️" },
    { to: "/admin/agents/approvals", label: "客户报备审核", icon: "✅" },
    { to: "/admin/agents/withdrawals", label: "提现记录", icon: "💳" },
  ]},
  { group: "模型管理", icon: "🤖", items: [
    { to: "/admin/models/marketplace", label: "模型市场", icon: "📈" },
  ]},
  { group: "营销推广", icon: "📢", items: [
    { to: "/admin/marketing/affiliate", label: "推荐返利", icon: "💰" },
    { to: "/admin/marketing/campaigns", label: "营销活动", icon: "🎯" },
  ]},
  { group: "工单客服", icon: "🎫", items: [
    { to: "/admin/tickets", label: "工单列表+处理", icon: "📋" },
    { to: "/admin/tickets/dispute", label: "消费争议处理", icon: "⚖️" },
    { to: "/admin/tickets/support", label: "客服效能", icon: "🤖" },
    { to: "/admin/tickets/chat", label: "在线客服", icon: "💬" },
    { to: "/admin/tickets/knowledge-base", label: "客服支撑", icon: "📚" },
  ]},
  { group: "系统设置", icon: "⚙️", items: [
    { to: "/admin/settings/announcements", label: "公告管理", icon: "📢" },
    { to: "/admin/settings/roles", label: "角色权限", icon: "🛡️" },
    { to: "/admin/settings/i18n", label: "国际化翻译", icon: "🌐" },
    { to: "/admin/settings/notification-policy", label: "通知策略", icon: "🔔" },
    { to: "/admin/settings/operator-dashboard", label: "运营看板", icon: "📊" },
    { to: "/admin/settings/user-permissions", label: "用户权限一览", icon: "👤" },
    { to: "/admin/settings/payment", label: "支付通道设置", icon: "💳" },
    { to: "/admin/ops/activity", label: "实时活动流", icon: "📡" },
    { to: "/admin/subscription", label: "订阅计划", icon: "📦" },
    { to: "/admin/account-deletion", label: "账号注销审核", icon: "🗑️" },
  ]},
  { group: "运维配置", icon: "🛠", items: [
    // 注：system/monitoring/oauth 原为 AdminSettingsPage 占位（无独立实现），database 为演示假查询，已从菜单摘除，待后端落地后再挂回
    { to: "/admin/config/groups", label: "用户分组", icon: "👥" },
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
    { to: "/admin/config/webhooks", label: "全局 Webhook", icon: "🌐" },
    { to: "/admin/config/cache", label: "缓存管理", icon: "⚡" },
    { to: "/admin/config/compliance", label: "合规法务", icon: "📜" },
  ]},
  { group: "审计合规", icon: "🔍", items: [
    { to: "/admin/audit/login-logs", label: "登录日志", icon: "📱" },
    { to: "/admin/audit/operations", label: "操作审计", icon: "📋" },
    { to: "/admin/audit/api-logs", label: "API 调用日志", icon: "🔌" },
    { to: "/admin/audit/conversation-records", label: "对话留痕", icon: "💬" },
    { to: "/admin/audit/operation-diff", label: "操作差异", icon: "🔄" },
    { to: "/admin/audit/data-request", label: "数据调取请求", icon: "📦" },
    { to: "/admin/audit/permissions", label: "权限审计日志", icon: "🛡️" },
  ]},
  { group: "风控合规", icon: "🚨", items: [
    { to: "/admin/risk/dashboard", label: "风控看板", icon: "📊" },
    { to: "/admin/risk/rules", label: "风控规则配置", icon: "📏" },
    { to: "/admin/risk/events", label: "风控事件管理", icon: "📋" },
    { to: "/admin/risk/blocks", label: "冻结/解冻管理", icon: "⛔" },
    { to: "/admin/risk/incidents", label: "安全事件响应", icon: "🛡️" },
    { to: "/admin/risk/ip-blacklist", label: "IP 黑名单", icon: "🌐" },
    { to: "/admin/risk/content-moderation", label: "内容审核", icon: "🛡️" },
  ]},
];

const SALES_NAV: NavItem[] = [
  { to: "/sales/customers", label: "nav.salesCustomers", icon: "👥" },
  { to: "/sales/reminders", label: "nav.salesReminders", icon: "⏰" },
  { to: "/sales/performance", label: "nav.salesPerformance", icon: "📊" },
];

/**
 * 财务角色最小导航（ARCH §12.4 D2 裁决：P0-3"假授权"前端残留修复）
 * 逐项按权限点 usePerm 过滤；完整权限菜单收敛随 SPEC-§30 动态权限二期统一。
 */
const FINANCE_NAV: (NavItem & { permKey: string })[] = [
  { to: "/admin/finance/manual-topup", label: "nav.financeTopup", icon: "✋", permKey: "finance.topup" },
  { to: "/admin/finance/orders", label: "nav.financeOrders", icon: "🧾", permKey: "finance.topup" },
  { to: "/admin/finance/refunds", label: "nav.financeRefunds", icon: "↩️", permKey: "finance.refund" },
  { to: "/admin/finance/invoices", label: "nav.invoices", icon: "📄", permKey: "finance.invoice" },
  { to: "/admin/finance/reconciliation", label: "nav.financeReconciliation", icon: "📊", permKey: "finance.reconciliation" },
  { to: "/admin/customers", label: "nav.financeCustomers", icon: "📋", permKey: "customer.view" },
];

const PORTAL_NAV: NavItem[] = [
  { to: "/", label: "nav.dashboard", icon: "📊" },
  { to: "/api-keys", label: "nav.apiKeys", icon: "🔑" },
  { to: "/playground", label: "nav.playground", icon: "🧪" },
  { to: "/mj-tasks", label: "nav.mjTasks", icon: "🎨" },
  { to: "/logs", label: "nav.logs", icon: "📋" },
  { to: "/recharge", label: "nav.recharge", icon: "💰" },
  { to: "/topup-records", label: "nav.topupRecords", icon: "📋" },
  { to: "/billing", label: "nav.billing", icon: "📄" },
  { to: "/invoices", label: "nav.invoices", icon: "🧾" },
  { to: "/redemption", label: "nav.redemption", icon: "🎟️" },
  { to: "/announcements", label: "nav.announcements", icon: "📢" },
  { to: "/real-name", label: "nav.realName", icon: "🆔" },
  { to: "/notification", label: "nav.notification", icon: "🔔" },
  { to: "/tickets", label: "nav.tickets", icon: "🎫" },
  { to: "/chat", label: "nav.chat", icon: "💬" },
  { to: "/security", label: "nav.security", icon: "🛡️" },
  { to: "/data-export", label: "nav.dataExport", icon: "📦", permKey: "portal.dataExport" },
  { to: "/user-groups", label: "nav.userGroups", icon: "👥" },
  { to: "/account-deletion", label: "nav.accountDeletion", icon: "🗑️" },
];

const AGENT_NAV: NavItem[] = [
  { to: "/agent/dashboard", label: "nav.agentDashboard", icon: "📈" },
  { to: "/agent/commission", label: "nav.agentCommission", icon: "💰" },
  { to: "/agent/consumption", label: "nav.agentConsumption", icon: "📊" },
  { to: "/agent/customers", label: "nav.agentCustomers", icon: "👥" },
  { to: "/agent/invite", label: "nav.agentInvite", icon: "🔗" },
  { to: "/agent/ranking", label: "nav.agentRanking", icon: "🏆" },
  { to: "/agent/withdraw", label: "nav.agentWithdraw", icon: "💳" },
  { to: "/agent/settings", label: "nav.agentSettings", icon: "🏢" },
  { to: "/agent/settlements", label: "nav.agentSettlements", icon: "📑" },
];

export default function ConsoleLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const impersonatedBy = useAuthStore((s) => s.impersonatedBy);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { t } = useI18n();

  // 角色标志（声明在授权状态查询之前，供其 enabled 条件使用）
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSales = user?.role === "sales";
  const isAgent = user?.role === "agent";
  const isFinance = user?.role === "finance";
  const roleLabel = isAdmin ? "ADMIN" : isAgent ? "AGENT" : isSales ? "SALES" : isFinance ? "FINANCE" : "";

  const unreadQ = useQuery({
    queryKey: ["me-announcements-unread"],
    queryFn: async () => (await api.get("/me/announcements/unread-count")).data.data?.unread ?? 0,
    refetchInterval: 60000,
  });

  /**
   * 数据导出授权状态查询（PRD §4.1 + 验收 D1-D4）：
   * 用户端「数据导出」菜单仅当 granted && isEnabled 时显示。
   * 仅普通门户用户需要查询（管理员走独立后台授权管理页，不展示该入口）。
   * 后端字段名优先匹配 PRD 契约 isEnabled，对接时对 enabled 命名做容错。
   */
  const dataExportGrantQ = useQuery({
    queryKey: ["me-data-export-grant-status"],
    queryFn: async () => {
      const r = await api.get<{ data: { granted: boolean; isEnabled?: boolean; enabled?: boolean } }>(
        "/me/data-export/grant-status",
      );
      const d = r.data.data;
      return {
        granted: !!d?.granted,
        // 兼容 isEnabled / enabled 两种后端字段命名
        enabled: !!(d?.isEnabled ?? d?.enabled),
      };
    },
    // 非管理员门户用户才触发查询；管理员/代理/销售/财务角色不查询（避免多余请求）
    enabled: !isAdmin && !isAgent && !isSales && !isFinance,
    retry: false,
  });
  /** 门户「数据导出」菜单显隐条件 = granted && isEnabled（PRD §4.1） */
  const canDataExport = !!(dataExportGrantQ.data?.granted && dataExportGrantQ.data?.enabled);

  const toggleGroup = (name: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // 财务导航逐项权限点（usePerm 为 hook，固定次数顶层调用，避免条件调用）
  const finPerms: Record<string, boolean> = {
    "finance.topup": usePerm("finance.topup"),
    "finance.refund": usePerm("finance.refund"),
    "finance.invoice": usePerm("finance.invoice"),
    "finance.reconciliation": usePerm("finance.reconciliation"),
    "customer.view": usePerm("customer.view"),
  };

  // 管理端菜单权限点（usePerm 固定次数顶层调用，避免在 JSX map 内条件调用）
  // 数据导出授权管理：查看权限点 dataExportGrant.view（PRD §9 / 验收 F1）
  const adminPerms: Record<string, boolean> = {
    "dataExportGrant.view": usePerm("dataExportGrant.view"),
    "dataExportGrant.edit": usePerm("dataExportGrant.edit"),
  };

  /** 管理端导航：组内菜单项按权限点过滤（无权限项的组整组隐藏） */
  const adminNavGroups = ADMIN_NAV
    .map(g => ({ ...g, items: g.items.filter(it => !it.permKey || adminPerms[it.permKey]) }))
    .filter(g => g.items.length > 0);

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-family)" }}>
      <aside style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 220, background: "#13151e", padding: "20px 0", zIndex: 100, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 18, fontWeight: 600, color: "#e0e0e0", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>⚡</span>3Cloud Admin
        </div>
        <nav style={{ flex: 1, overflowY: "auto", marginTop: 4 }}>
          {/* ── Admin ── */}
          {isAdmin && <>
            <SidebarLink to="/admin/cockpit" icon="🚀" label={t("nav.adminCockpit")} />
            <SidebarLink to="/admin/dashboard" icon="📊" label={t("nav.adminDashboard")} />
            {adminNavGroups.map(g => (
              <div key={g.group}>
                <div onClick={() => toggleGroup(g.group)} style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#666", cursor: "pointer", userSelect: "none" }}>
                  <span>{g.icon}</span><span style={{ flex: 1 }}>{t(g.group)}</span>
                  <span style={{ fontSize: 10, transform: collapsed.has(g.group) ? "rotate(0deg)" : "rotate(90deg)", transition: "transform .2s" }}>▶</span>
                </div>
                {!collapsed.has(g.group) && g.items.map(item => (
                  <SidebarSubLink key={item.to} to={item.to} label={t(item.label)} icon={item.icon} />
                ))}
              </div>
            ))}
          </>}

          {/* ── Agent ── */}
          {isAgent && AGENT_NAV.map(item => <SidebarLink key={item.to} to={item.to} icon={item.icon} label={t(item.label)} />)}

          {/* ── Sales ── */}
          {isSales && <>
            <div style={{ padding: "16px 20px 6px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>{t("nav.salesWorkbench")}</div>
            {SALES_NAV.map(item => <SidebarLink key={item.to} to={item.to} icon={item.icon} label={t(item.label)} />)}
          </>}

          {/* ── Finance（最小财务导航，逐项权限点过滤） ── */}
          {isFinance && <>
            <div style={{ padding: "16px 20px 6px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>{t("nav.financeWorkbench")}</div>
            {FINANCE_NAV.filter(item => finPerms[item.permKey] ?? false).map(item => (
              <SidebarLink key={item.to} to={item.to} icon={item.icon} label={t(item.label)} />
            ))}
          </>}

          {/* ── User portal ── */}
          {!isAdmin && !isAgent && !isSales && !isFinance && PORTAL_NAV
            .filter(item => !(item.permKey === "portal.dataExport" && !canDataExport)) // 数据导出菜单按授权状态条件渲染（PRD §4.1）
            .map(item => <SidebarLink key={item.to} to={item.to} icon={item.icon} label={t(item.label)} />)}
        </nav>
      </aside>

      <div style={{ marginLeft: 220, flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* 模拟模式横幅 — PRD §5.4：impersonatedBy 存在时常驻显示，一键退出模拟 */}
        {impersonatedBy && user && (
          <div
            style={{
              background: "#fff3cd",
              borderBottom: "2px solid #ffc107",
              color: "#7a4f01",
              padding: "8px 20px",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              zIndex: 120,
              position: "sticky",
              top: 0,
            }}
          >
            <span style={{ fontWeight: 600 }}>
              🔓 正在以 {user.email} 身份查看（由 {impersonatedBy.email} 模拟）
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <HelpIcon text="当前正以目标用户身份模拟登录客户后台，用于排障/演示。模拟期间敏感资金与权限写操作被禁用，操作全程留痕；点击「退出模拟」恢复原管理员会话。" />
              <button
                type="button"
                className="c3-btn c3-btn--default c3-btn--sm"
                style={{ fontWeight: 600, borderColor: "#b8860b", color: "#7a4f01" }}
                onClick={() => {
                  stopImpersonation();
                  navigate("/admin/customers");
                }}
              >
                退出模拟
              </button>
            </span>
          </div>
        )}
        <PageHeaderProvider>
          <TopbarAndOutlet userEmail={user?.email ?? ""} roleLabel={roleLabel} balance={user?.balance ?? 0} unread={unreadQ.data} isAdmin={isAdmin || isFinance} onLogout={handleLogout} />
        </PageHeaderProvider>
      </div>
    </div>
  );
}

/**
 * 顶栏 + 内容区 — 对齐原型 admin-design-system.css：
 *   topbar-left = 页标题 + `?` 帮助 + 角色徽章
 *   topbar-right = 用户邮箱 + 🔔 + 「管理员▼」下拉菜单
 */
function TopbarAndOutlet(props: {
  userEmail: string;
  roleLabel: string;
  balance: number;
  unread: number | undefined;
  isAdmin: boolean;
  onLogout: () => void;
}) {
  const { userEmail, roleLabel, balance, unread, isAdmin, onLogout } = props;
  const { t, lang, setLanguage } = useI18n();
  const info = usePageHeader();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="c3-topbar">
        <div className="c3-topbar__left">
          {info?.title && (
            <h2>
              {info.title}
              {info.help && <HelpIcon text={info.help} level="page" />}
              {roleLabel && <span className="c3-admin-badge">{roleLabel}</span>}
            </h2>
          )}
        </div>
        <div className="c3-topbar__right">
          <span className="c3-user-email">{userEmail}</span>
          <Link to="/announcements" className="c3-bell" aria-label={t("topbar.notifications")}>
            🔔{unread ? <span className="c3-bell__badge">{unread > 99 ? "99+" : unread}</span> : null}
          </Link>

          {/* ── 语言切换下拉（8 语言；保持当前路由不跳走、不清空表单） ── */}
          <LanguageSwitcher lang={lang} onSelect={setLanguage} />

          <div className={`c3-action-dropdown${menuOpen ? " c3-action-dropdown--open" : ""}`}>
            <button type="button" className="c3-action-trigger" onClick={() => setMenuOpen(o => !o)}>
              {roleLabel || t("topbar.account")} <span style={{ fontSize: 10 }}>▼</span>
            </button>
            <div className="c3-dropdown-menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="c3-dropdown-menu__item" onClick={() => { setMenuOpen(false); navigate("/security"); }}>{t("topbar.personalSettings")}</div>
              <div className="c3-dropdown-menu__item" onClick={() => { setMenuOpen(false); navigate("/security"); }}>{t("topbar.changePassword")}</div>
              {!isAdmin && (
                <div className="c3-dropdown-menu__item" onClick={() => { setMenuOpen(false); navigate("/recharge"); }}>{t("topbar.balance")}: {fmtMoney(balance)}</div>
              )}
              <div className="c3-dropdown-menu__divider" />
              <div className="c3-dropdown-menu__item c3-dropdown-menu__item--danger" onClick={onLogout}>{t("common.logout")}</div>
            </div>
          </div>
        </div>
      </header>
      <main className="c3-content" style={{ flex: 1, background: "#f0f2f5" }}>
        <ConsentBanner />
        <Outlet />
      </main>
    </>
  );
}

/** 顶栏语言切换下拉：8 语言，切换后调 setLanguage（保持当前路由与表单状态）。 */
function LanguageSwitcher({ lang, onSelect }: { lang: I18nLang; onSelect: (l: I18nLang) => void }) {
  const [open, setOpen] = useState(false);
  const labelMap: Record<I18nLang, string> = {
    "zh-CN": "简体中文",
    en: "English",
    "ja-JP": "日本語",
    "ko-KR": "한국어",
    vi: "Tiếng Việt",
    th: "ไทย",
    id: "Bahasa Indonesia",
    fil: "Filipino",
  };
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        aria-label="Switch language"
        onClick={() => setOpen(o => !o)}
        style={{
          background: "transparent", border: "1px solid rgba(0,0,0,.12)", borderRadius: 6,
          padding: "4px 10px", cursor: "pointer", fontSize: 13,
        }}
      >
        🌐 {labelMap[lang]}
      </button>
      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 200,
            background: "#fff", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,.12)", padding: 4, minWidth: 150,
          }}
        >
          {CONSOLE_LANGS.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => { onSelect(l); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left", background: l === lang ? "#eef2ff" : "transparent",
                border: "none", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 13,
              }}
            >
              {labelMap[l]}
            </button>
          ))}
        </div>
      )}
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

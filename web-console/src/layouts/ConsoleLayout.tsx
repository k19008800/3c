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
import type { ReactNode } from "react";

type NavItem = { to: string; label: string; icon: string; permKey?: string };
type NavGroup = { group: string; icon: string; items: NavItem[] };

/**
 * 导航最小描边 SVG 图标集（规范 §8 原创性：替换 emoji，24×24 stroke=currentColor）
 * 颜色随父级文字色（默认 --color-sidebar-text / 激活白）。
 */
const ICON_PATHS: Record<string, ReactNode> = {
  rocket: <><path d="M12 15c4-4 5.5-9 5.5-9S13 7 9 11l3 4z"/><circle cx="12" cy="9" r="1.5"/><path d="M9 15l-3 1 1.5 3M12 15l.5 4 3-1.5"/></>,
  chart: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></>,
  trendUp: <><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></>,
  trendDown: <><path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/></>,
  users: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M17.5 14.6c2 .8 3.4 2.4 4 5.4"/></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></>,
  coin: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.6-2.5 1.7-2.5.7-2.5 1.7 1 1.7 2.5 1.7 2.5-.7 2.5-1.7"/></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.8 1.8-2.7 3-2.7s2.5.9 3 2.7M15 9h4M15 13h4"/></>,
  box: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></>,
  banknote: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></>,
  bank: <><path d="M3 10l9-6 9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></>,
  hand: <><path d="M8 12V5.5a1.5 1.5 0 013 0V11M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7-3 0-4.5-1.5-6-4l-1.8-3.5c-.5-1 .2-2 1.3-1.6L8 12z"/></>,
  scale: <><path d="M12 4v16M8 20h8M6 6h12"/><path d="M6 6l-3 6a3 3 0 006 0L6 6zM18 6l-3 6a3 3 0 006 0l-3-6z"/></>,
  receipt: <><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z"/><path d="M9 8h6M9 12h6"/></>,
  doc: <><path d="M7 3h7l5 5v13H7V3z"/><path d="M14 3v5h5M10 13h4M10 17h4"/></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>,
  ticket: <><path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4V8z"/><path d="M13 7v10" strokeDasharray="2 2"/></>,
  swap: <><path d="M7 4L3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/></>,
  tag: <><path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="8" cy="9" r="1.3"/></>,
  shield: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/></>,
  plug: <><path d="M9 3v5M15 3v5M7 8h10v4a5 5 0 01-10 0V8zM12 17v4"/></>,
  sliders: <><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/></>,
  building: <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/></>,
  trophy: <><path d="M8 4h8v5a4 4 0 01-8 0V4z"/><path d="M8 5H5a3 3 0 003 4M16 5h3a3 3 0 01-3 4M12 13v4M8 21h8M9 17h6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>,
  signal: <><path d="M4 20v-4M9 20v-7M14 20v-10M19 20V4"/></>,
  alert: <><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></>,
  warn: <><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/></>,
  bot: <><rect x="4" y="8" width="16" height="11" rx="2"/><path d="M12 8V4M8 3h8M2 12v3M22 12v3"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/></>,
  megaphone: <><path d="M3 10v4h4l9 5V5L7 10H3z"/><path d="M18 9a4 4 0 010 6"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/></>,
  chat: <><path d="M21 12a8 8 0 01-8 8H4l2-3a8 8 0 1115-5z"/></>,
  book: <><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z"/><path d="M4 19a2 2 0 012-2h13"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>,
  bell: <><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 004 0"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></>,
  edit: <><path d="M4 20h4L20 8l-4-4L4 16v4z"/><path d="M13 7l4 4"/></>,
  wrench: <><path d="M14 7a4.5 4.5 0 00-6 6L3 18l3 3 5-5a4.5 4.5 0 006-6l-3 3-2-2 3-3z"/></>,
  gauge: <><path d="M4 14a8 8 0 1116 0"/><path d="M12 14l4-4"/><circle cx="12" cy="14" r="1"/></>,
  refresh: <><path d="M4 12a8 8 0 0114-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 01-14 5.3L4 15"/><path d="M4 20v-5h5"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>,
  news: <><rect x="3" y="4" width="14" height="16" rx="1"/><path d="M17 8h3v11a1 1 0 01-1 1h-2M7 8h6M7 12h6M7 16h4"/></>,
  bolt: <><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></>,
  scroll: <><path d="M8 3h11v18H8a3 3 0 01-3-3V6a3 3 0 013-3z"/><path d="M8 3a3 3 0 00-3 3M10 8h6M10 12h6"/></>,
  ruler: <><path d="M3 15L15 3l6 6L9 21l-6-6z"/><path d="M7 13l2 2M11 9l2 2M9 11l2 2"/></>,
  ban: <><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  key: <><circle cx="8" cy="15" r="4"/><path d="M11 12L20 3M16 7l3 3"/></>,
  flask: <><path d="M9 3h6M10 3v6L4.5 18a2 2 0 001.8 3h11.4a2 2 0 001.8-3L14 9V3"/><path d="M7 15h10"/></>,
  palette: <><path d="M12 3a9 9 0 000 18h2a2.5 2.5 0 000-5h-1.5a1.5 1.5 0 010-3H16a5 5 0 000-10h-4z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="7" r="1"/></>,
  link: <><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1.5-1.5"/></>,
  bookmark: <><path d="M6 3h12v18l-6-4-6 4V3z"/><path d="M9 8h6"/></>,
  undo: <><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></>,
  crystal: <><path d="M12 3l4 6-4 12-4-12 4-6z"/><path d="M8 9h8"/></>,
  factory: <><path d="M3 21V10l6 4v-4l6 4V4h6v17H3z"/><path d="M17 8h2M17 12h2M17 16h2"/></>,
};

/** 导航描边图标组件：颜色继承 currentColor（侧栏文字色） */
function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ flexShrink: 0 }}
    >
      {ICON_PATHS[name] ?? ICON_PATHS.chart}
    </svg>
  );
}

const ADMIN_NAV: NavGroup[] = [
  { group: "客户管理", icon: "users", items: [
    // 注：原型客户管理组无「客户详情」菜单项（详情由列表「查看」进入），此处不挂 /admin/customers/:userId
    { to: "/admin/customers", label: "客户列表", icon: "list" },
    { to: "/admin/customers/quotas", label: "额度管理", icon: "coin" },
    { to: "/admin/customers/verifications", label: "实名认证审核", icon: "id" },
    // 数据导出授权管理（PRD §5.2）：按用户维度定向授权，挂在客户管理组
    { to: "/admin/config/data-export-grants", label: "数据导出授权", icon: "box", permKey: "dataExportGrant.view" },
  ]},
  { group: "财务结算", icon: "banknote", items: [
    { to: "/admin/finance/dashboard", label: "财务工作台", icon: "bank" },
    { to: "/admin/finance/accounts", label: "资金账户", icon: "banknote" },
    { to: "/admin/finance/close", label: "结账管理", icon: "lock" },
    { to: "/admin/finance/manual-topup", label: "人工上账", icon: "hand" },
    { to: "/admin/finance/adjust", label: "手动调账", icon: "scale" },
    { to: "/admin/finance/orders", label: "充值订单", icon: "receipt" },
    { to: "/admin/finance/commissions", label: "佣金流水", icon: "banknote" },
    { to: "/admin/finance/refunds", label: "退款审核", icon: "undo" },
    { to: "/admin/finance/invoices", label: "发票审核", icon: "doc" },
    { to: "/admin/finance/withdrawals", label: "提现管理", icon: "card" },
    { to: "/admin/finance/coupons", label: "兑换码管理", icon: "ticket" },
    { to: "/admin/finance/reconciliation", label: "对账报表", icon: "chart" },
    { to: "/admin/finance/reconciliation-diff", label: "对账差异", icon: "swap" },
    { to: "/admin/finance/discount-engine", label: "折扣规则引擎", icon: "ticket" },
    { to: "/admin/finance/tax-banking", label: "税负与银行账户", icon: "bank" },
    { to: "/admin/finance/supplier-bill-match", label: "供应商账单核对", icon: "receipt" },
    { to: "/admin/finance/cost-dashboard", label: "成本看板", icon: "trendDown" },
    { to: "/admin/finance/cost-prediction", label: "成本预测", icon: "crystal" },
    { to: "/admin/finance/settlement", label: "结算对账", icon: "scale" },
    { to: "/admin/finance/profit", label: "利润分析", icon: "trendUp" },
    { to: "/admin/finance/pricing", label: "价格管理", icon: "tag" },
    { to: "/admin/finance/risk-config", label: "风控规则配置", icon: "shield" },
  ]},
  { group: "供应商管理", icon: "plug", items: [
    // 注：详情由列表进入，不挂参数化菜单 /admin/suppliers/:id
    { to: "/admin/suppliers", label: "供应商列表", icon: "list" },
    { to: "/admin/suppliers/model-service", label: "模型服务管理", icon: "sliders" },
    { to: "/admin/suppliers/vendor-profiles", label: "厂商资料管理", icon: "building" },
    { to: "/admin/suppliers/vendor-pricing", label: "厂商定价管理", icon: "banknote" },
    { to: "/admin/suppliers/vendor-cost", label: "供应商成本管理", icon: "box" },
    { to: "/admin/suppliers/vendor-stats", label: "用户选购统计", icon: "chart" },
    { to: "/admin/suppliers/price-change", label: "价格变更通知", icon: "megaphone" },
    { to: "/admin/suppliers/vendor-performance", label: "供应商绩效", icon: "trophy" },
    { to: "/admin/suppliers/multimodal-models", label: "多模态模型管理", icon: "sliders" },
    { to: "/admin/suppliers/competitive-monitor", label: "竞品价格监控", icon: "search" },
  ]},
  { group: "消费运营", icon: "chart", items: [
    { to: "/admin/consumption/tracking", label: "消费明细追踪", icon: "search" },
    { to: "/admin/consumption/stream", label: "实时消费流水", icon: "signal" },
    { to: "/admin/consumption/anomaly", label: "消费异常检测", icon: "alert" },
    { to: "/admin/consumption/balance-alert", label: "余额预警管理", icon: "warn" },
  ]},
  { group: "客户分析", icon: "trendUp", items: [
    { to: "/admin/analytics/funnel", label: "转化漏斗分析", icon: "chart" },
    { to: "/admin/analytics/success", label: "客户成功看板", icon: "target" },
  ]},
  { group: "代理商管理", icon: "users", items: [
    // 注：详情由列表进入，不挂参数化菜单 /admin/agents/:id
    { to: "/admin/agents", label: "代理商列表", icon: "list" },
    { to: "/admin/agents/commission-config", label: "佣金配置", icon: "settings" },
    { to: "/admin/agents/approvals", label: "客户报备审核", icon: "check" },
    { to: "/admin/agents/withdrawals", label: "提现记录", icon: "card" },
  ]},
  { group: "模型管理", icon: "bot", items: [
    { to: "/admin/models/marketplace", label: "模型市场", icon: "trendUp" },
  ]},
  { group: "营销推广", icon: "megaphone", items: [
    { to: "/admin/marketing/affiliate", label: "推荐返利", icon: "banknote" },
    { to: "/admin/marketing/campaigns", label: "营销活动", icon: "target" },
  ]},
  { group: "工单客服", icon: "ticket", items: [
    { to: "/admin/tickets", label: "工单列表+处理", icon: "list" },
    { to: "/admin/tickets/dispute", label: "消费争议处理", icon: "scale" },
    { to: "/admin/tickets/support", label: "客服效能", icon: "bot" },
    { to: "/admin/tickets/chat", label: "在线客服", icon: "chat" },
    { to: "/admin/tickets/knowledge-base", label: "客服支撑", icon: "book" },
  ]},
  { group: "系统设置", icon: "settings", items: [
    { to: "/admin/settings/announcements", label: "公告管理", icon: "megaphone" },
    { to: "/admin/settings/roles", label: "角色权限", icon: "shield" },
    { to: "/admin/settings/i18n", label: "国际化翻译", icon: "globe" },
    { to: "/admin/settings/notification-policy", label: "通知策略", icon: "bell" },
    { to: "/admin/settings/operator-dashboard", label: "运营看板", icon: "chart" },
    { to: "/admin/settings/user-permissions", label: "用户权限一览", icon: "user" },
    { to: "/admin/settings/payment", label: "支付通道设置", icon: "card" },
    { to: "/admin/ops/activity", label: "实时活动流", icon: "signal" },
    { to: "/admin/subscription", label: "订阅计划", icon: "box" },
    { to: "/admin/account-deletion", label: "账号注销审核", icon: "trash" },
  ]},
  { group: "运维配置", icon: "wrench", items: [
    // 注：system/monitoring/oauth 原为 AdminSettingsPage 占位（无独立实现），database 为演示假查询，已从菜单摘除，待后端落地后再挂回
    { to: "/admin/config/groups", label: "用户分组", icon: "users" },
    { to: "/admin/config/performance", label: "性能配置", icon: "gauge" },
    { to: "/admin/config/webhook-retry", label: "Webhook 重试", icon: "refresh" },
    { to: "/admin/config/undo", label: "撤销操作日志", icon: "undo" },
    { to: "/admin/config/smtp", label: "SMTP 邮箱", icon: "mail" },
    { to: "/admin/config/logs", label: "日志维护", icon: "edit" },
    { to: "/admin/config/maintenance", label: "系统维护", icon: "wrench" },
    { to: "/admin/config/site", label: "站点设置", icon: "globe" },
    { to: "/admin/config/rate-limit", label: "限流设置", icon: "gauge" },
    { to: "/admin/config/email-templates", label: "邮件模板", icon: "news" },
    { to: "/admin/config/content", label: "内容管理", icon: "doc" },
    { to: "/admin/config/webhooks", label: "全局 Webhook", icon: "globe" },
    { to: "/admin/config/cache", label: "缓存管理", icon: "bolt" },
    { to: "/admin/config/compliance", label: "合规法务", icon: "scroll" },
  ]},
  { group: "审计合规", icon: "search", items: [
    { to: "/admin/audit/login-logs", label: "登录日志", icon: "phone" },
    { to: "/admin/audit/operations", label: "操作审计", icon: "list" },
    { to: "/admin/audit/api-logs", label: "API 调用日志", icon: "plug" },
    { to: "/admin/audit/conversation-records", label: "对话留痕", icon: "chat" },
    { to: "/admin/audit/operation-diff", label: "操作差异", icon: "refresh" },
    { to: "/admin/audit/data-request", label: "数据调取请求", icon: "box" },
    { to: "/admin/audit/permissions", label: "权限审计日志", icon: "shield" },
  ]},
  { group: "风控合规", icon: "alert", items: [
    { to: "/admin/risk/dashboard", label: "风控看板", icon: "chart" },
    { to: "/admin/risk/rules", label: "风控规则配置", icon: "ruler" },
    { to: "/admin/risk/events", label: "风控事件管理", icon: "list" },
    { to: "/admin/risk/blocks", label: "冻结/解冻管理", icon: "ban" },
    { to: "/admin/risk/incidents", label: "安全事件响应", icon: "shield" },
    { to: "/admin/risk/ip-blacklist", label: "IP 黑名单", icon: "globe" },
    { to: "/admin/risk/content-moderation", label: "内容审核", icon: "shield" },
  ]},
];

const SALES_NAV: NavItem[] = [
  { to: "/sales/customers", label: "nav.salesCustomers", icon: "users" },
  { to: "/sales/reminders", label: "nav.salesReminders", icon: "clock" },
  { to: "/sales/performance", label: "nav.salesPerformance", icon: "chart" },
];

/**
 * 财务角色最小导航（ARCH §12.4 D2 裁决：P0-3"假授权"前端残留修复）
 * 逐项按权限点 usePerm 过滤；完整权限菜单收敛随 SPEC-§30 动态权限二期统一。
 */
const FINANCE_NAV: (NavItem & { permKey: string })[] = [
  { to: "/admin/finance/manual-topup", label: "nav.financeTopup", icon: "hand", permKey: "finance.topup" },
  { to: "/admin/finance/orders", label: "nav.financeOrders", icon: "receipt", permKey: "finance.topup" },
  { to: "/admin/finance/refunds", label: "nav.financeRefunds", icon: "undo", permKey: "finance.refund" },
  { to: "/admin/finance/invoices", label: "nav.invoices", icon: "doc", permKey: "finance.invoice" },
  { to: "/admin/finance/reconciliation", label: "nav.financeReconciliation", icon: "chart", permKey: "finance.reconciliation" },
  { to: "/admin/customers", label: "nav.financeCustomers", icon: "list", permKey: "customer.view" },
];

const PORTAL_NAV: NavItem[] = [
  { to: "/", label: "nav.dashboard", icon: "chart" },
  { to: "/api-keys", label: "nav.apiKeys", icon: "key" },
  { to: "/playground", label: "nav.playground", icon: "flask" },
  { to: "/mj-tasks", label: "nav.mjTasks", icon: "palette" },
  { to: "/logs", label: "nav.logs", icon: "list" },
  { to: "/recharge", label: "nav.recharge", icon: "banknote" },
  { to: "/topup-records", label: "nav.topupRecords", icon: "list" },
  { to: "/billing", label: "nav.billing", icon: "doc" },
  { to: "/invoices", label: "nav.invoices", icon: "receipt" },
  { to: "/redemption", label: "nav.redemption", icon: "ticket" },
  { to: "/announcements", label: "nav.announcements", icon: "megaphone" },
  { to: "/real-name", label: "nav.realName", icon: "id" },
  { to: "/notification", label: "nav.notification", icon: "bell" },
  { to: "/tickets", label: "nav.tickets", icon: "ticket" },
  { to: "/chat", label: "nav.chat", icon: "chat" },
  { to: "/security", label: "nav.security", icon: "shield" },
  { to: "/data-export", label: "nav.dataExport", icon: "box", permKey: "portal.dataExport" },
  { to: "/user-groups", label: "nav.userGroups", icon: "users" },
  { to: "/account-deletion", label: "nav.accountDeletion", icon: "trash" },
];

const AGENT_NAV: NavItem[] = [
  { to: "/agent/dashboard", label: "nav.agentDashboard", icon: "trendUp" },
  { to: "/agent/commission", label: "nav.agentCommission", icon: "banknote" },
  { to: "/agent/consumption", label: "nav.agentConsumption", icon: "chart" },
  { to: "/agent/customers", label: "nav.agentCustomers", icon: "users" },
  { to: "/agent/invite", label: "nav.agentInvite", icon: "link" },
  { to: "/agent/ranking", label: "nav.agentRanking", icon: "trophy" },
  { to: "/agent/withdraw", label: "nav.agentWithdraw", icon: "card" },
  { to: "/agent/settings", label: "nav.agentSettings", icon: "building" },
  { to: "/agent/settlements", label: "nav.agentSettlements", icon: "bookmark" },
];

export default function ConsoleLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const impersonatedBy = useAuthStore((s) => s.impersonatedBy);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="c3-shell">
      {mobileNavOpen && <div className="c3-sidebar-backdrop" onClick={closeMobileNav} />}
      <aside className={`c3-sidebar${mobileNavOpen ? " c3-sidebar--open" : ""}`}>
        <div className="c3-sidebar__logo">
          <NavIcon name="bolt" size={22} />浩寅云 Admin
        </div>
        <nav className="c3-sidebar__nav">
          {/* ── Admin ── */}
          {isAdmin && <>
            <SidebarLink to="/admin/cockpit" icon="rocket" label={t("nav.adminCockpit")} onClick={closeMobileNav} />
            <SidebarLink to="/admin/dashboard" icon="chart" label={t("nav.adminDashboard")} onClick={closeMobileNav} />
            {adminNavGroups.map(g => (
              <div key={g.group}>
                <div onClick={() => toggleGroup(g.group)} style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-sidebar-text)", cursor: "pointer", userSelect: "none" }}>
                  <NavIcon name={g.icon} size={15} /><span style={{ flex: 1 }}>{t(g.group)}</span>
                  <span className="c3-caret" style={{ fontSize: 10, transform: collapsed.has(g.group) ? "rotate(0deg)" : "rotate(90deg)" }}>▶</span>
                </div>
                {!collapsed.has(g.group) && g.items.map(item => (
                  <SidebarSubLink key={item.to} to={item.to} label={t(item.label)} icon={item.icon} onClick={closeMobileNav} />
                ))}
              </div>
            ))}
          </>}

          {/* ── Agent ── */}
          {isAgent && AGENT_NAV.map(item => <SidebarLink key={item.to} to={item.to} icon={item.icon} label={t(item.label)} onClick={closeMobileNav} />)}

          {/* ── Sales ── */}
          {isSales && <>
            <div style={{ padding: "16px 20px 6px", fontSize: 11, color: "var(--color-text-inverse-muted)", textTransform: "uppercase", letterSpacing: 1 }}>{t("nav.salesWorkbench")}</div>
            {SALES_NAV.map(item => <SidebarLink key={item.to} to={item.to} icon={item.icon} label={t(item.label)} onClick={closeMobileNav} />)}
          </>}

          {/* ── Finance（最小财务导航，逐项权限点过滤） ── */}
          {isFinance && <>
            <div style={{ padding: "16px 20px 6px", fontSize: 11, color: "var(--color-text-inverse-muted)", textTransform: "uppercase", letterSpacing: 1 }}>{t("nav.financeWorkbench")}</div>
            {FINANCE_NAV.filter(item => finPerms[item.permKey] ?? false).map(item => (
              <SidebarLink key={item.to} to={item.to} icon={item.icon} label={t(item.label)} onClick={closeMobileNav} />
            ))}
          </>}

          {/* ── User portal ── */}
          {!isAdmin && !isAgent && !isSales && !isFinance && PORTAL_NAV
            .filter(item => !(item.permKey === "portal.dataExport" && !canDataExport)) // 数据导出菜单按授权状态条件渲染（PRD §4.1）
            .map(item => <SidebarLink key={item.to} to={item.to} icon={item.icon} label={t(item.label)} onClick={closeMobileNav} />)}
        </nav>
      </aside>

      <div className="c3-sidebar__content">
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
          <TopbarAndOutlet userEmail={user?.email ?? ""} roleLabel={roleLabel} balance={user?.balance ?? 0} unread={unreadQ.data} isAdmin={isAdmin || isFinance} onLogout={handleLogout} onOpenMobileNav={() => setMobileNavOpen(true)} />
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
  onOpenMobileNav: () => void;
}) {
  const { userEmail, roleLabel, balance, unread, isAdmin, onLogout, onOpenMobileNav } = props;
  const { t, lang, setLanguage } = useI18n();
  const info = usePageHeader();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="c3-topbar">
        <div className="c3-topbar__left">
          <button type="button" className="c3-hamburger" aria-label={t("topbar.menu") || "菜单"} onClick={onOpenMobileNav}>☰</button>
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
            <NavIcon name="bell" size={20}/>{unread ? <span className="c3-bell__badge">{unread > 99 ? "99+" : unread}</span> : null}
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
      <main className="c3-content" style={{ flex: 1 }}>
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
        <NavIcon name="globe" size={16}/> {labelMap[lang]}
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
                display: "block", width: "100%", textAlign: "left", background: l === lang ? "var(--color-primary-light)" : "transparent",
                border: "none", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "var(--color-text)",
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

function SidebarLink({ to, icon, label, onClick }: NavItem & { onClick?: () => void }) {
  return <NavLink to={to} end={to === "/"} onClick={onClick} className={({ isActive }) => isActive ? "c3-sidebar__link c3-sidebar__link--active" : "c3-sidebar__link"}>
    <NavIcon name={icon} size={17} />{label}
  </NavLink>;
}

function SidebarSubLink({ to, icon, label, onClick }: NavItem & { onClick?: () => void }) {
  return <NavLink to={to} onClick={onClick} className={({ isActive }) => isActive ? "c3-sidebar__sublink c3-sidebar__sublink--active" : "c3-sidebar__sublink"}>
    <NavIcon name={icon} size={14} />{label}
  </NavLink>;
}

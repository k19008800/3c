import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import ConsentBanner from "../components/ConsentBanner";

/**
 * Console 主布局 — 精确对齐 portal-common.css + prototypes
 * 侧栏 220px / #13151e / Logo / Emoji导航 / 蓝色选中线
 * 顶栏 用户邮箱 / 余额 / 通知铃铛 / 退出
 * 主内容区 margin-left:220px / padding 20px 24px / bg #f0f2f5
 */

type NavDef = { to: string; label: string; icon: string; end?: boolean };

export default function ConsoleLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const unreadQ = useQuery({
    queryKey: ["me-announcements-unread"],
    queryFn: async () => (await api.get<{ data: { unread: number } }>("/me/announcements/unread-count")).data.data,
    refetchInterval: 60000,
  });

  const handleLogout = () => { logout(); navigate("/login"); };

  // ── 侧栏导航（对齐原型 emoji 图标）──
  // 用户门户导航
  const portalNav: NavDef[] = [
    { to: "/", label: "仪表盘", icon: "📊", end: true },
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

  const isAgent = user?.role === "agent";
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSales = user?.role === "sales";

  // 代理自助面板
  const agentNav: NavDef[] = [
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

  // 管理后台子菜单（折叠组，对齐原型 nav-sub 结构）
  const adminNav: { group: string; icon: string; items: NavDef[] }[] = [
    { group: "管理后台", icon: "⚙️", items: [
      { to: "/admin/dashboard", label: "业务看板", icon: "📊" },
      { to: "/admin/cockpit", label: "数据驾驶舱", icon: "🚀" },
      { to: "/admin/customers", label: "客户管理", icon: "👥" },
      { to: "/admin/credit", label: "额度管理", icon: "🪙" },
      { to: "/admin/agents", label: "代理管理", icon: "🤝" },
      { to: "/admin/withdrawals", label: "提现审核", icon: "🏦" },
      { to: "/admin/vendors", label: "供应商管理", icon: "🏭" },
      { to: "/admin/vendor-settlements", label: "供应商结算", icon: "💳" },
      { to: "/admin/finance", label: "财务管理", icon: "💰" },
      { to: "/admin/manual-recharge", label: "人工上账", icon: "✋" },
      { to: "/admin/recharge-orders", label: "充值订单", icon: "🧾" },
      { to: "/admin/refunds", label: "退款审核", icon: "↩️" },
      { to: "/admin/pricing", label: "价格管理", icon: "🏷️" },
      { to: "/admin/coupons", label: "兑换码管理", icon: "🎟️" },
      { to: "/admin/consent", label: "合规管理", icon: "📜" },
      { to: "/admin/knowledge-base", label: "客服支撑", icon: "📚" },
      { to: "/admin/models", label: "模型管理", icon: "🧠" },
      { to: "/admin/invoices", label: "税票管理", icon: "🧾" },
      { to: "/admin/real-name", label: "实名审核", icon: "✅" },
      { to: "/admin/redemption", label: "兑换码", icon: "🎟️" },
      { to: "/admin/announcements", label: "公告管理", icon: "📢" },
      { to: "/admin/campaigns", label: "营销活动", icon: "🎯" },
      { to: "/admin/email-templates", label: "邮件模板", icon: "📧" },
      { to: "/admin/activity", label: "实时活动流", icon: "📡" },
      { to: "/admin/tickets", label: "工单管理", icon: "🎫" },
      { to: "/admin/support", label: "客服效能", icon: "📈" },
      { to: "/admin/chat", label: "在线客服", icon: "💬" },
      { to: "/admin/deletion", label: "注销审核", icon: "🗑️" },
    ]},
    { group: "权限管理", icon: "🔒", items: [
      { to: "/admin/roles", label: "角色权限", icon: "👤" },
      { to: "/admin/users-permission", label: "用户权限一览", icon: "👥" },
      { to: "/admin/permission-audit", label: "权限审计", icon: "🔍" },
    ]},
    { group: "⏺️ 系统管理", icon: "🖥️", items: [
      { to: "/admin/settings", label: "系统设置", icon: "⚙️" },
      { to: "/admin/i18n", label: "国际化翻译", icon: "🌐" },
      { to: "/admin/undo", label: "撤销操作", icon: "↩️" },
      { to: "/admin/data-requests", label: "数据导出请求", icon: "📦" },
      { to: "/admin/subscriptions", label: "订阅计划", icon: "📦" },
      { to: "/admin/affiliate", label: "推荐返利", icon: "💰" },
      { to: "/admin/content", label: "内容管理", icon: "📄" },
      { to: "/admin/content-moderation", label: "内容审核", icon: "🛡️" },
      { to: "/admin/notification-policies", label: "通知策略", icon: "🔔" },
      { to: "/admin/tax-banking", label: "税票银行", icon: "🏦" },
      { to: "/admin/discount-rules", label: "折扣规则", icon: "🎫" },
      { to: "/admin/disputes", label: "争议处理", icon: "⚖️" },
      { to: "/admin/webhook-retry", label: "Webhook重试", icon: "🔄" },
      { to: "/admin/performance", label: "性能配置", icon: "⚡" },
      { to: "/admin/apikey-security", label: "Key安全策略", icon: "🔑" },
      { to: "/admin/sys/db", label: "数据库管理", icon: "🗄️" },
      { to: "/admin/sys/cache", label: "缓存管理", icon: "⚡" },
      { to: "/admin/sys/logs", label: "日志查看器", icon: "📝" },
      { to: "/admin/webhooks", label: "Webhook 配置", icon: "🔗" },
      { to: "/admin/sys/version", label: "版本与变更", icon: "🏷️" },
    ]},
    { group: "🔌 供应商管理", icon: "🏭", items: [
      { to: "/admin/suppliers", label: "供应商列表", icon: "📋" },
      { to: "/admin/suppliers/1", label: "供应商详情", icon: "🔍" },
      { to: "/admin/model-services", label: "模型服务管理", icon: "🎛️" },
      { to: "/admin/vendor-profiles", label: "厂商资料管理", icon: "🏢" },
      { to: "/admin/vendor-pricing", label: "厂商定价管理", icon: "💰" },
      { to: "/admin/vendor-costs", label: "成本管理", icon: "📦" },
      { to: "/admin/vendor-stats", label: "用户选购统计", icon: "📊" },
      { to: "/admin/vendor-performance", label: "供应商绩效", icon: "🏆" },
      { to: "/admin/marketplace", label: "模型市场", icon: "📈" },
      { to: "/admin/multimodal-models", label: "多模态模型", icon: "🎛️" },
      { to: "/admin/price-changes", label: "价格变更通知", icon: "📢" },
    ]},
    { group: "🚨 风控与审计", icon: "🛡️", items: [
      { to: "/admin/risk", label: "风控看板", icon: "📊" },
      { to: "/admin/risk/rules", label: "风控规则配置", icon: "📏" },
      { to: "/admin/risk/events", label: "风控事件管理", icon: "📋" },
      { to: "/admin/audit-logs", label: "操作审计", icon: "🔍" },
      { to: "/admin/consumption/anomalies", label: "消费异常提醒", icon: "⚠️" },
      { to: "/admin/consumption/stream", label: "消费流监控", icon: "📡" },
      { to: "/admin/consumption/tracking", label: "消费追踪", icon: "🔎" },
      { to: "/admin/security/incidents", label: "安全事件响应", icon: "🛡️" },
      { to: "/admin/security/ip-blacklist", label: "IP 黑名单", icon: "🌍" },
      { to: "/admin/balance-alerts", label: "余额预警", icon: "🔔" },
    ]},
    { group: "📊 运营分析", icon: "📈", items: [
      { to: "/admin/operator/dashboard", label: "运营看板", icon: "📊" },
      { to: "/admin/operator/diff", label: "操作差异", icon: "🔄" },
      { to: "/admin/conversion/funnel", label: "转化漏斗", icon: "📊" },
      { to: "/admin/competitive/monitor", label: "竞品价格监控", icon: "🔍" },
      { to: "/admin/commission/flow", label: "佣金流水", icon: "💸" },
      { to: "/admin/settlement", label: "结算对账", icon: "⚖️" },
      { to: "/admin/reconciliation", label: "对账报表", icon: "📊" },
      { to: "/admin/reconciliation/diffs", label: "对账差异", icon: "🔍" },
      { to: "/admin/profit", label: "利润分析", icon: "📈" },
      { to: "/admin/cost/dashboard", label: "成本看板", icon: "📉" },
      { to: "/admin/cost/prediction", label: "成本预测", icon: "🔮" },
    ]},
  ];

  const salesNav: NavDef[] = [
    { to: "/sales/customers", label: "客户管理", icon: "👥" },
    { to: "/sales/reminders", label: "跟进提醒", icon: "⏰" },
    { to: "/sales/performance", label: "业绩看板", icon: "📊" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-family)" }}>
      {/* ═══════ 侧栏（对齐原型 .sidebar）═══════ */}
      <aside style={{
        position: "fixed", left: 0, top: 0, bottom: 0,
        width: 220, background: "#13151e",
        padding: "20px 0", zIndex: 100,
        display: "flex", flexDirection: "column",
      }}>
        {/* Logo */}
        <div style={{
          padding: "0 20px 24px",
          borderBottom: "1px solid rgba(255,255,255,.06)",
          fontSize: 18, fontWeight: 600, color: "#e0e0e0",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 22 }}>☁️</span>
          3Cloud
        </div>

        <nav style={{ flex: 1, overflowY: "auto", marginTop: 4 }}>
          {/* Portal 导航 — 仅普通用户看到 */}
          {!isAdmin && portalNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: "12px 20px", display: "flex", alignItems: "center", gap: 10,
                fontSize: 14, color: isActive ? "#6a8aff" : "#666",
                textDecoration: "none",
                background: isActive ? "rgba(79,110,247,.12)" : "transparent",
                borderRight: isActive ? "3px solid #6a8aff" : "3px solid transparent",
                transition: "background .15s, color .15s",
              })}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* 业务员工作台 */}
          {isSales && (
            <>
              <div style={{ padding: "16px 20px 6px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                业务员工作台
              </div>
              {salesNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={({ isActive }) => ({
                    padding: "12px 20px", display: "flex", alignItems: "center", gap: 10,
                    fontSize: 14, color: isActive ? "#6a8aff" : "#666",
                    textDecoration: "none",
                    background: isActive ? "rgba(79,110,247,.12)" : "transparent",
                    borderRight: isActive ? "3px solid #6a8aff" : "3px solid transparent",
                    transition: "background .15s, color .15s",
                  })}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}

          {/* 代理自助面板 */}
          {isAgent && (
            <>
              <div style={{ padding: "16px 20px 6px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                代理自助面板
              </div>
              {agentNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={({ isActive }) => ({
                    padding: "12px 20px", display: "flex", alignItems: "center", gap: 10,
                    fontSize: 14, color: isActive ? "#6a8aff" : "#666",
                    textDecoration: "none",
                    background: isActive ? "rgba(79,110,247,.12)" : "transparent",
                    borderRight: isActive ? "3px solid #6a8aff" : "3px solid transparent",
                    transition: "background .15s, color .15s",
                  })}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}

          {/* 管理后台（折叠组） */}
          {isAdmin && adminNav.map((group) => (
            <div key={group.group}>
              <div style={{ padding: "16px 20px 6px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                {group.group}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={({ isActive }) => ({
                    padding: "10px 20px 10px 48px", display: "flex", alignItems: "center", gap: 8,
                    fontSize: 13, color: isActive ? "#6a8aff" : "#666",
                    textDecoration: "none",
                    background: isActive ? "rgba(79,110,247,.12)" : "transparent",
                    borderRight: isActive ? "3px solid #6a8aff" : "3px solid transparent",
                    transition: "background .15s, color .15s",
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* ═══════ 主内容区（对齐原型 .main）═══════ */}
      <div style={{ marginLeft: 220, flex: 1, display: "flex", flexDirection: "column" }}>
        {/* 顶栏（对齐原型 .topbar） */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 24,
          padding: "20px 24px 0",
        }}>
          <div style={{ fontSize: 13, color: "#888" }}>
            <span style={{ color: "#666", cursor: "default" }}>{user?.username ?? user?.email ?? "未登录"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "#888" }}>
            <span style={{ cursor: "pointer", color: "#6a8aff", fontWeight: 500 }} onClick={() => navigate("/recharge")}>
              余额: ¥{((user?.balance ?? 0) / 100).toFixed(2)}
            </span>
            <Link to="/announcements" style={{ position: "relative", fontSize: 18, cursor: "pointer", textDecoration: "none" }} title="公告">
              🔔
              {unreadQ.data?.unread ? (
                <span style={{
                  position: "absolute", top: -4, right: -8,
                  background: "#e53935", color: "#fff",
                  fontSize: 10, width: 16, height: 16, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {unreadQ.data.unread > 99 ? "99+" : unreadQ.data.unread}
                </span>
              ) : null}
            </Link>
            <button onClick={handleLogout} style={{
              background: "none", border: "none", color: "#888",
              fontSize: 13, cursor: "pointer", padding: 0,
            }}>
              退出
            </button>
          </div>
        </div>

        {/* 内容 */}
        <main style={{ padding: "0 24px 20px", flex: 1, background: "#f0f2f5" }}>
          <ConsentBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

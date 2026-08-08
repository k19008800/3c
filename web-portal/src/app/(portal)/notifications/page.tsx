/**
 * NotificationPage — 对齐 portal-notification.html
 *
 * Features:
 * - Notification list with 10 types (system/security/consume/ticket)
 * - Category tabs filter
 * - Mark as read / mark all read
 * - Click to view detail modal
 * - Unread count badge
 * - Empty state
 */
"use client";

import { useState, useCallback, useMemo } from "react";
import { HelpIcon, StatusBadge } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

/* ==================== Types ==================== */
type NotifyCategory = "all" | "system" | "security" | "consume" | "ticket";

interface Notification {
  id: number;
  category: "system" | "security" | "consume" | "ticket";
  icon: string;
  type: string;
  title: string;
  time: string;
  desc: string;
  body: string;
  action?: string;
  actionTarget?: string;
}

/* ==================== Mock Data ==================== */
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 1, category: "system", icon: "📢", type: "系统公告",
    title: "系统维护通知：8月6日 02:00-04:00 平台升级",
    time: "2026-08-05 14:30",
    desc: "尊敬的用户，3cloud 平台将于 2026年8月6日 02:00-04:00 进行系统升级维护，期间服务可能短暂中断。",
    body: `<p>尊敬的用户：</p><p>3cloud 平台将于 <strong>2026年8月6日 02:00-04:00</strong> 进行系统升级维护。</p>
<p>本次升级内容包括：</p><p>1. 新增 DeepSeek-V4 Pro 模型支持<br>2. 优化 API 限流策略<br>3. 修复已知问题若干</p>
<p>升级期间服务可能短暂中断，请提前做好安排。</p>`,
    action: "查看公告", actionTarget: "system",
  },
  {
    id: 2, category: "consume", icon: "💰", type: "消费",
    title: "充值成功通知",
    time: "2026-08-05 10:15",
    desc: "您的账户已成功充值 ¥500.00，当前余额 ¥1,234.56。感谢您的使用！",
    body: `<p>您的账户已成功充值！</p><p><strong>充值金额：</strong>¥500.00<br><strong>充值方式：</strong>支付宝<br><strong>当前余额：</strong>¥1,234.56</p>`,
    action: "查看充值记录", actionTarget: "recharge",
  },
  {
    id: 3, category: "consume", icon: "⚠️", type: "消费",
    title: "余额不足提醒",
    time: "2026-08-05 09:42",
    desc: "您的账户余额仅剩 ¥2.30，已低于预警阈值（¥10.00），请及时充值以免影响 API 调用。",
    body: `<p>您的账户余额不足！</p><p><strong>当前余额：</strong>¥2.30<br><strong>预警阈值：</strong>¥10.00</p>`,
    action: "立即充值", actionTarget: "recharge",
  },
  {
    id: 4, category: "security", icon: "🔒", type: "安全",
    title: "异地登录安全提醒",
    time: "2026-08-05 08:32",
    desc: "检测到您的账号于 2026-08-05 08:30 在新设备（IP: 36.112.22.31，深圳）登录。如非本人操作，请立即修改密码。",
    body: `<p>检测到您的账号在新设备登录：</p><p><strong>登录 IP：</strong>36.112.22.31<br><strong>登录地点：</strong>广东省深圳市</p><p>如非本人操作，请立即修改密码。</p>`,
    action: "修改密码", actionTarget: "security",
  },
  {
    id: 5, category: "ticket", icon: "🎫", type: "工单",
    title: "工单 #TS2026080501 已回复",
    time: "2026-08-04 18:20",
    desc: "客服已回复您的工单「关于 DeepSeek-V4 限流问题咨询」，请查看回复内容。",
    body: `<p>您的工单已收到客服回复：</p><p><strong>工单编号：</strong>#TS2026080501</p><p>DeepSeek-V4 Flash 默认并发限制为 10 QPM，如需提升可在 API Key 管理中调整。</p>`,
    action: "查看工单", actionTarget: "ticket",
  },
  {
    id: 6, category: "system", icon: "📢", type: "系统公告",
    title: "新模型上线：GPT-5 已可用",
    time: "2026-08-03 16:00",
    desc: "3cloud 已支持 OpenAI GPT-5 模型，欢迎在 API Key 管理中配置使用。新模型限时 8 折优惠。",
    body: `<p>3cloud 平台已正式支持 OpenAI GPT-5 模型！</p><p>限时优惠：8月31日前 8 折</p>`,
    action: "前往 API Key 管理", actionTarget: "apikey",
  },
  {
    id: 7, category: "consume", icon: "🧾", type: "消费",
    title: "发票已开具",
    time: "2026-08-02 14:10",
    desc: "您申请的 7 月发票（金额 ¥1,234.56，增值税电子普通发票）已开具完成，请前往发票页面下载。",
    body: `<p>您的发票已开具完成：</p><p><strong>金额：</strong>¥1,234.56<br><strong>所属月份：</strong>2026年7月</p>`,
    action: "查看发票", actionTarget: "invoice",
  },
  {
    id: 8, category: "security", icon: "✅", type: "安全",
    title: "实名认证通过",
    time: "2026-08-01 11:30",
    desc: "您的实名认证已审核通过，认证类型：个人认证。现在可以使用全部平台功能。",
    body: `<p>恭喜！您的实名认证已审核通过。</p><p><strong>认证类型：</strong>个人认证</p>`,
    action: "查看账户安全", actionTarget: "security",
  },
  {
    id: 9, category: "ticket", icon: "🎫", type: "工单",
    title: "工单 #TS2026072803 已关闭",
    time: "2026-07-30 09:00",
    desc: "您的工单「请求增加并发限制」已关闭。如需进一步帮助请提交新工单。",
    body: `<p>您的工单已关闭。</p><p><strong>关闭原因：</strong>问题已解决</p>`,
  },
  {
    id: 10, category: "ticket", icon: "🔑", type: "工单",
    title: "API Key 过期提醒",
    time: "2026-07-28 10:00",
    desc: "您的 API Key「test-key-001」将于 2026-08-07 到期，请及时续期或创建新 Key。",
    body: `<p>您的 API Key 即将到期：</p><p><strong>Key 名称：</strong>test-key-001<br><strong>过期时间：</strong>2026-08-07</p>`,
    action: "管理 API Key", actionTarget: "apikey",
  },
];

const CATEGORIES: { key: NotifyCategory; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "system", label: "系统公告" },
  { key: "security", label: "安全" },
  { key: "consume", label: "消费" },
  { key: "ticket", label: "工单" },
];

const CATEGORY_ICON_COLORS: Record<string, { bg: string; color: string }> = {
  system: { bg: "rgba(79,110,247,0.08)", color: "var(--color-primary)" },
  security: { bg: "rgba(229,57,53,0.08)", color: "#ef5350" },
  consume: { bg: "rgba(255,167,38,0.08)", color: "#ffa726" },
  ticket: { bg: "rgba(102,187,106,0.08)", color: "#66bb6a" },
};

/* ==================== Component ==================== */
export default function NotificationPage() {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [readIds, setReadIds] = useState<Set<number>>(new Set([6, 7, 8, 9, 10]));
  const [activeCat, setActiveCat] = useState<NotifyCategory>("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return activeCat === "all"
      ? notifications
      : notifications.filter((n) => n.category === activeCat);
  }, [notifications, activeCat]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    CATEGORIES.forEach((c) => {
      counts[c.key] = c.key === "all"
        ? notifications.length
        : notifications.filter((n) => n.category === c.key).length;
    });
    return counts;
  }, [notifications]);

  const detail = detailId ? notifications.find((n) => n.id === detailId) : null;

  const handleOpenDetail = useCallback((id: number) => {
    setDetailId(id);
    setReadIds((prev) => new Set([...prev, id]));
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  }, [notifications]);

  const isUnread = (id: number) => !readIds.has(id);

  return (
    <>
      <PortalTopbar
        title="通知中心"
        helpHint="查看系统公告、安全告警、消费提醒、工单回复等通知，可配置通知偏好"
        unread={unreadCount}
      />

      {/* Category Tabs */}
      <div style={{
        background: "var(--color-panel)",
        borderRadius: "var(--radius-xl)",
        marginBottom: 0,
        boxShadow: "var(--shadow-panel)",
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex",
          borderBottom: "1px solid var(--color-divider)",
        }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCat(cat.key)}
              style={{
                padding: "10px 20px",
                fontSize: "var(--font-size-md)",
                color: activeCat === cat.key ? "var(--color-primary)" : "var(--color-text-secondary)",
                borderBottom: activeCat === cat.key ? "2px solid var(--color-primary)" : "2px solid transparent",
                cursor: "pointer",
                background: "none",
                border: "none",
                transition: "all var(--transition-fast)",
              }}
            >
              {cat.label}
              <span style={{ fontSize: "var(--font-size-xs)", marginLeft: 4, color: activeCat === cat.key ? "var(--color-primary)" : "var(--color-text-secondary)" }}>
                {catCounts[cat.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Action Bar */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 20px", borderBottom: "1px solid var(--color-divider)",
          background: "var(--color-panel)",
        }}>
          <span style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
            {unreadCount} 条未读
          </span>
          <button
            onClick={handleMarkAllRead}
            style={{
              padding: "6px 14px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)", background: "var(--color-panel)",
              color: "var(--color-text-secondary)", fontSize: "var(--font-size-md)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.color = "var(--color-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
          >
            ✓ 全部已读
            <HelpIcon text="将所有未读通知标记为已读" />
          </button>
        </div>

        {/* Notification List */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)" }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>📭</div>
            <div>暂无通知</div>
          </div>
        ) : (
          <ul style={{ listStyle: "none" }}>
            {filtered.map((n) => {
              const colors = CATEGORY_ICON_COLORS[n.category] || CATEGORY_ICON_COLORS.system;
              const unread = isUnread(n.id);
              return (
                <li
                  key={n.id}
                  onClick={() => handleOpenDetail(n.id)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "14px 20px", borderBottom: "1px solid var(--color-divider-light)",
                    cursor: "pointer", transition: "background var(--transition-fast)",
                    position: "relative", opacity: unread ? 1 : 0.7,
                    fontSize: "var(--font-size-md)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-primary-lighter)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                >
                  {unread && (
                    <div style={{
                      position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                      width: 6, height: 6, borderRadius: "50%", background: "var(--color-primary)",
                    }} />
                  )}
                  <div style={{
                    width: 36, height: 36, borderRadius: "var(--radius-lg)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, flexShrink: 0, marginLeft: 8,
                    background: colors.bg, color: colors.color,
                  }}>
                    {n.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "var(--font-size-base)",
                      color: unread ? "var(--color-text)" : "var(--color-text-muted)",
                      marginBottom: 4, fontWeight: unread ? 600 : 400,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      {n.title}
                      <span style={{
                        display: "inline-block", padding: "1px 8px", borderRadius: 10,
                        fontSize: "var(--font-size-xs)", background: colors.bg, color: colors.color,
                      }}>
                        {n.type}
                      </span>
                    </div>
                    <div style={{
                      fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {n.desc}
                    </div>
                    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 4 }}>
                      {n.time}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div
          style={{
            position: "fixed", inset: 0, background: "var(--color-modal-overlay)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setDetailId(null)}
        >
          <div
            style={{
              background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
              width: 540, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto",
              border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-modal)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: "16px 20px", borderBottom: "1px solid var(--color-divider)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <h3 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <span>{detail.icon}</span> {detail.title}
                <span style={{
                  display: "inline-block", padding: "1px 8px", borderRadius: 10,
                  fontSize: "var(--font-size-xs)", background: CATEGORY_ICON_COLORS[detail.category].bg,
                  color: CATEGORY_ICON_COLORS[detail.category].color,
                }}>
                  {detail.type}
                </span>
              </h3>
              <button onClick={() => setDetailId(null)} style={{
                background: "none", border: "none", fontSize: 20, color: "var(--color-text-secondary)", cursor: "pointer",
              }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 16 }}>
                📅 {detail.time}
              </div>
              <div
                style={{ fontSize: "var(--font-size-base)", lineHeight: 1.8, color: "var(--color-text)", marginBottom: 20 }}
                dangerouslySetInnerHTML={{ __html: detail.body }}
              />
            </div>
            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--color-divider)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setDetailId(null)}
                style={{
                  padding: "8px 20px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                  background: "var(--color-panel)", color: "var(--color-text-secondary)", cursor: "pointer",
                }}
              >
                关闭
              </button>
              {detail.action && (
                <button
                  style={{
                    padding: "8px 20px", borderRadius: "var(--radius-md)", border: "none",
                    background: "var(--color-primary)", color: "#fff", cursor: "pointer",
                  }}
                >
                  {detail.action} →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

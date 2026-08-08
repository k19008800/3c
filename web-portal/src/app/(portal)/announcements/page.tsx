/**
 * AnnouncementsPage — 公告列表页
 *
 * Features:
 * - Announcement list (title, time, category)
 * - Detail modal/expand
 * - Read/unread status
 */
"use client";

import { useState, useCallback, useMemo } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

interface Announcement {
  id: number;
  title: string;
  category: string;
  categoryColor: string;
  time: string;
  summary: string;
  body: string;
}

const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 1, title: "系统维护通知：8月6日 02:00-04:00 平台升级",
    category: "系统维护", categoryColor: "var(--color-primary)",
    time: "2026-08-05 14:30",
    summary: "3cloud 平台将于 8月6日凌晨进行升级维护，新增 DeepSeek-V4 Pro 支持，优化限流策略。",
    body: `<p>尊敬的用户：</p><p>3cloud 平台将于 <strong>2026年8月6日 02:00-04:00</strong> 进行系统升级维护。</p>
<p>升级内容：新增 DeepSeek-V4 Pro 模型、优化 API 限流策略、修复已知问题。</p>
<p>升级期间服务可能短暂中断，请提前安排。</p>`,
  },
  {
    id: 2, title: "新模型上线：GPT-5、Claude Opus 4.8 已可用",
    category: "新功能", categoryColor: "var(--color-success-text)",
    time: "2026-08-03 16:00",
    summary: "3cloud 已正式支持 GPT-5 和 Claude Opus 4.8 模型，限时 8 折优惠。",
    body: `<p>3cloud 平台已正式支持：</p><p><strong>GPT-5</strong> — 输入 ¥0.05/1K tokens，输出 ¥0.15/1K tokens</p>
<p><strong>Claude Opus 4.8</strong> — 输入 ¥0.15/1K tokens，输出 ¥0.75/1K tokens</p>
<p>限时优惠至 8月31日，欢迎在 API Key 管理中配置。</p>`,
  },
  {
    id: 3, title: "实名认证功能上线",
    category: "安全合规", categoryColor: "var(--color-danger-text)",
    time: "2026-07-28 10:00",
    summary: "平台已上线实名认证功能，未认证账户每日 API 调用限额 100 次。",
    body: `<p>为保障平台安全合规运营，现已上线实名认证功能。</p>
<p><strong>个人认证：</strong>需提供身份证信息，1-3个工作日审核。</p>
<p><strong>企业认证：</strong>需提供营业执照，3-5个工作日审核。</p>
<p>请前往「实名认证」页面完成认证。</p>`,
  },
  {
    id: 4, title: "充值活动：单笔满 ¥500 赠 5% 代金券",
    category: "活动", categoryColor: "#f59e0b",
    time: "2026-07-20 09:00",
    summary: "7月20日至8月31日，单笔充值满 ¥500 即赠 5% 代金券，上不封顶。",
    body: `<p>🎉 暑期充值特惠活动</p><p><strong>活动时间：</strong>2026年7月20日 - 8月31日</p>
<p><strong>活动内容：</strong>单笔充值满 ¥500，即赠 5% 代金券。代金券有效期 30 天，可用于 API 调用消费。</p>`,
  },
  {
    id: 5, title: "API 接口新增流式调用（SSE）支持",
    category: "新功能", categoryColor: "var(--color-success-text)",
    time: "2026-07-15 14:00",
    summary: "所有聊天模型接口现已支持 Server-Sent Events 流式返回，大幅降低首字延迟。",
    body: `<p>所有聊天模型接口现已支持 SSE 流式调用：</p><p>设置 <code>stream: true</code> 即可启用。</p>
<p>流式调用可大幅降低 <strong>首字延迟</strong>，提升用户体验。详见 API 文档。</p>`,
  },
];

export default function AnnouncementsPage() {
  const [announcements] = useState<Announcement[]>(MOCK_ANNOUNCEMENTS);
  const [readIds, setReadIds] = useState<Set<number>>(new Set([3, 4]));
  const [detailId, setDetailId] = useState<number | null>(null);

  const detail = detailId ? announcements.find((a) => a.id === detailId) : null;

  const handleOpen = useCallback((id: number) => {
    setDetailId(id);
    setReadIds((prev) => new Set([...prev, id]));
  }, []);

  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;

  return (
    <>
      <PortalTopbar
        title="系统公告"
        helpHint="查看平台系统公告、新功能上线、维护通知和优惠活动"
        unread={unreadCount}
      />

      <div style={{
        background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-panel)", overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h3 style={{ fontSize: "var(--font-size-base)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            📢 公告列表
            <HelpIcon text="展示平台系统公告、新功能上线、维护通知等" />
          </h3>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            共 {announcements.length} 条 · {unreadCount} 条未读
          </span>
        </div>

        {announcements.map((a) => {
          const unread = !readIds.has(a.id);
          return (
            <div
              key={a.id}
              onClick={() => handleOpen(a.id)}
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--color-divider-light)",
                cursor: "pointer",
                transition: "background var(--transition-fast)",
                opacity: unread ? 1 : 0.7,
                position: "relative",
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontWeight: unread ? 600 : 400, fontSize: "var(--font-size-lg)", color: "var(--color-text)", display: "flex", alignItems: "center", gap: 10 }}>
                  {a.title}
                  <span style={{
                    display: "inline-block", padding: "2px 10px", borderRadius: 10,
                    fontSize: "var(--font-size-xs)", fontWeight: 500,
                    background: a.categoryColor + "18", color: a.categoryColor,
                  }}>
                    {a.category}
                  </span>
                </div>
                <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", whiteSpace: "nowrap", marginLeft: 16 }}>
                  📅 {a.time}
                </span>
              </div>
              <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                {a.summary}
              </div>
            </div>
          );
        })}
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
              width: 600, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto",
              boxShadow: "var(--shadow-modal)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: "16px 24px", borderBottom: "1px solid var(--color-divider)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <h3 style={{ fontSize: "var(--font-size-xl)", fontWeight: 600 }}>
                {detail.title}
              </h3>
              <button onClick={() => setDetailId(null)} style={{
                background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer",
              }}>×</button>
            </div>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--color-divider-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
                <span style={{
                  padding: "2px 10px", borderRadius: 10, fontSize: "var(--font-size-xs)",
                  background: detail.categoryColor + "18", color: detail.categoryColor,
                }}>
                  {detail.category}
                </span>
                <span>📅 {detail.time}</span>
              </div>
            </div>
            <div
              style={{ padding: 24, fontSize: "var(--font-size-base)", lineHeight: 1.9, color: "var(--color-text)" }}
              dangerouslySetInnerHTML={{ __html: detail.body }}
            />
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--color-divider)", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setDetailId(null)}
                style={{
                  padding: "8px 24px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                  background: "var(--color-panel)", cursor: "pointer", color: "var(--color-text-secondary)",
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

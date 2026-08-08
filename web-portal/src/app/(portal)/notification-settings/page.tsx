/**
 * NotificationSettingsPage — 对齐 portal-notification.html 通知设置视图
 *
 * Features:
 * - 4 notification type groups (system, security, consume, ticket)
 * - Toggle switch per type per channel (site/email)
 * - Site notifications always on (locked)
 * - Save button + toast feedback
 */
"use client";

import { useState, useCallback } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

type Channel = "site" | "email";

interface NotificationSetting {
  key: string;
  label: string;
  desc: string;
  icon: string;
  channels: Record<Channel, boolean>;
  lockedChannels: Channel[];
}

const INITIAL_SETTINGS: NotificationSetting[] = [
  {
    key: "system", icon: "📢", label: "系统公告",
    desc: "平台维护、新模型上线、功能更新等系统级通知",
    channels: { site: true, email: true },
    lockedChannels: ["site"],
  },
  {
    key: "security", icon: "🔒", label: "安全通知",
    desc: "异地登录、密码修改、实名认证等安全相关提醒",
    channels: { site: true, email: true },
    lockedChannels: ["site"],
  },
  {
    key: "consume", icon: "💰", label: "消费通知",
    desc: "充值到账、余额不足、发票开具、消费预警等",
    channels: { site: true, email: true },
    lockedChannels: ["site"],
  },
  {
    key: "ticket", icon: "🎫", label: "工单通知",
    desc: "工单回复、工单状态变更、Key 过期提醒等",
    channels: { site: true, email: true },
    lockedChannels: ["site"],
  },
];

const siteLockedHelp = "站内通知默认开启不可关闭";

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSetting[]>(INITIAL_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [toastShow, setToastShow] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const toggleChannel = useCallback((groupKey: string, channel: Channel) => {
    setSettings((prev) =>
      prev.map((s) => {
        if (s.key !== groupKey) return s;
        if (s.lockedChannels.includes(channel)) return s;
        return {
          ...s,
          channels: { ...s.channels, [channel]: !s.channels[channel] },
        };
      })
    );
  }, []);

  const handleSave = useCallback(() => {
    setToastMsg("通知偏好已保存");
    setToastShow(true);
    setSaved(true);
    setTimeout(() => setToastShow(false), 2500);
  }, []);

  const isLocked = (setting: NotificationSetting, channel: Channel) =>
    setting.lockedChannels.includes(channel);

  const channelLabels: Record<Channel, string> = {
    site: "站内信",
    email: "邮件",
  };

  return (
    <>
      <PortalTopbar title="通知设置" helpHint="配置各类通知的接收渠道，站内信默认开启且不可关闭" />

      <div style={{
        background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-panel)", overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h3 style={{
            fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            通知偏好设置
            <HelpIcon text="配置各类通知的接收渠道，站内信默认开启且不可关闭" />
          </h3>
        </div>

        <div style={{ padding: "16px 20px" }}>
          {settings.map((setting) => (
            <div key={setting.key} style={{ marginBottom: 24 }}>
              <h4 style={{
                fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)",
                marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--color-divider)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {setting.icon} {setting.label}
                <HelpIcon text={setting.desc} />
              </h4>

              {(Object.keys(setting.channels) as Channel[]).map((channel) => {
                const locked = isLocked(setting, channel);
                const isOn = setting.channels[channel];
                return (
                  <div
                    key={channel}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 0", borderBottom: "1px solid var(--color-divider-light)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text)", marginBottom: 2 }}>
                        {channelLabels[channel]}
                        {locked && (
                          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginLeft: 8 }}>
                            （无法关闭）
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                        {locked ? "在通知中心显示，无法关闭" : `发送至 demo@test.com`}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", minWidth: 50, textAlign: "center" }}>
                        {channelLabels[channel]}
                      </span>
                      <label
                        style={{
                          position: "relative", width: 36, height: 20, cursor: locked ? "not-allowed" : "pointer",
                          opacity: locked ? 0.5 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggleChannel(setting.key, channel)}
                          disabled={locked}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: "absolute", inset: 0,
                          background: isOn ? "var(--color-primary)" : "#d9d9d9",
                          borderRadius: 20, transition: "background 0.2s",
                        }} />
                        <span style={{
                          position: "absolute",
                          width: 16, height: 16,
                          borderRadius: "50%",
                          background: "#fff",
                          top: 2,
                          left: isOn ? 18 : 2,
                          transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                        {locked && (
                          <span style={{
                            position: "absolute", top: "50%", left: "50%",
                            transform: "translate(-50%,-50%)",
                            fontSize: 10, color: "#888", zIndex: 1,
                            pointerEvents: "none",
                          }}>
                            🔒
                          </span>
                        )}
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button
          onClick={handleSave}
          style={{
            padding: "10px 32px", borderRadius: "var(--radius-lg)",
            background: "var(--color-primary)", color: "#fff",
            border: "none", fontSize: "var(--font-size-base)",
            fontWeight: 500, cursor: "pointer",
            transition: "background var(--transition-fast)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-primary-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-primary)"; }}
        >
          保存设置
        </button>
      </div>

      {/* Toast */}
      {toastShow && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "10px 20px", borderRadius: "var(--radius-lg)",
          fontSize: "var(--font-size-md)",
          background: "var(--color-success-bg)", color: "var(--color-success-text)",
          border: "1px solid var(--color-success-border)",
          boxShadow: "var(--shadow-toast)",
        }}>
          ✅ {toastMsg}
        </div>
      )}
    </>
  );
}

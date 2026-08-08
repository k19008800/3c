import { useState, useEffect, useCallback } from "react";
import PortalLayout from "../../components/PortalLayout";
import HelpIcon from "../../components/HelpIcon";
import api from "../../services/api";

interface Notification {
  id: string;
  title: string;
  body: string;
  time?: string;
  created_at?: string;
  read: boolean;
  type: "system" | "billing" | "security" | "feature";
}

const TYPE_ICONS: Record<string, string> = {
  system: "📢",
  billing: "💰",
  security: "🔒",
  feature: "🚀",
};

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [prefs, setPrefs] = useState({
    email: true,
    site: true,
    billing: true,
    feature: true,
    security: true,
  });

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await api.get<Notification[]>("/notifications", { limit: 100 });
      if (error) throw new Error(error);
      setNotifications(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e.message || "加载通知失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const filtered = tab === "unread"
    ? notifications.filter((n) => !n.read)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    try {
      await api.put(`/notifications/${id}/read`);
    } catch {
      setActionError("标记已读失败");
      setTimeout(() => setActionError(null), 3000);
    }
  };

  const markAllRead = async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.put("/notifications/read-all");
    } catch {
      setActionError("全部标为已读失败");
      setTimeout(() => setActionError(null), 3000);
    }
  };

  const formatTime = (n: Notification) => {
    return n.time || n.created_at || "";
  };

  const togglePref = (key: keyof typeof prefs) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  return (
    <PortalLayout>
      <h1 className="page-title">
        通知中心 <HelpIcon title="查看系统通知、账单消息和安全提醒" />
      </h1>
      <p className="page-subtitle">管理您的通知消息和推送偏好</p>

      {actionError && (
        <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-warning-text)" }}>
          {actionError}
        </div>
      )}

      <div className="section mt-4">
        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <div>加载中...</div>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div>{loadError}</div>
          </div>
        ) : (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="flex-row">
              <button
                className={`tab ${tab === "all" ? "active" : ""}`}
                onClick={() => setTab("all")}
              >
                全部 ({notifications.length})
              </button>
              <button
                className={`tab ${tab === "unread" ? "active" : ""}`}
                onClick={() => setTab("unread")}
              >
                未读 ({unreadCount})
              </button>
            </div>
            {unreadCount > 0 && (
              <button className="btn btn-outline btn-sm" onClick={markAllRead}>
                全部标为已读
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div>暂无通知</div>
            </div>
          ) : (
            <div>
              {filtered.map((notif) => (
                <div
                  key={notif.id}
                  className={`notification-item${notif.read ? "" : " unread"}`}
                  onClick={() => markAsRead(notif.id)}
                >
                  {!notif.read && <div className="notification-dot" />}
                  <div className="notification-content">
                    <div className="notification-title">
                      <span style={{ marginRight: 6 }}>{TYPE_ICONS[notif.type]}</span>
                      {notif.title}
                    </div>
                    <div className="notification-body">{notif.body}</div>
                  </div>
                  <div className="notification-time">{formatTime(notif)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Notification Preferences */}
      <div className="section">
        <div className="card">
          <div className="card-title">通知偏好 <HelpIcon title="设置您希望接收的通知类型和推送渠道" /></div>
          <table style={{ maxWidth: 500 }}>
            <thead>
              <tr>
                <th>通知类型</th>
                <th>邮件通知</th>
                <th>站内通知</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>账单通知</td>
                <td>
                  <button
                    className={`toggle${prefs.billing ? " on" : ""}`}
                    onClick={() => togglePref("billing")}
                    aria-label="切换邮件账单通知"
                  />
                </td>
                <td>
                  <button
                    className={`toggle${prefs.site ? " on" : ""}`}
                    onClick={() => togglePref("site")}
                    aria-label="切换站内账单通知"
                  />
                </td>
              </tr>
              <tr>
                <td>安全通知</td>
                <td>
                  <button
                    className={`toggle${prefs.security ? " on" : ""}`}
                    onClick={() => togglePref("security")}
                    aria-label="切换邮件安全通知"
                  />
                </td>
                <td>
                  <button
                    className={`toggle${prefs.site ? " on" : ""}`}
                    onClick={() => togglePref("site")}
                    aria-label="切换站内安全通知"
                  />
                </td>
              </tr>
              <tr>
                <td>功能更新</td>
                <td>
                  <button
                    className={`toggle${prefs.feature ? " on" : ""}`}
                    onClick={() => togglePref("feature")}
                    aria-label="切换邮件功能更新通知"
                  />
                </td>
                <td>
                  <button
                    className={`toggle${prefs.site ? " on" : ""}`}
                    onClick={() => togglePref("site")}
                    aria-label="切换站内功能更新通知"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}

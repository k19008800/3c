import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

// §22.6 通知偏好设置页
// 对应 SPEC-§22-用户端体验增强.md §22.6

interface NotificationPrefs {
  emailEnabled: boolean;
  emailFrequency: string;
  emailDigestTime: string;
  inAppPreferences: Record<string, boolean>;
  emailPreferences: Record<string, boolean>;
  balanceLowThreshold: number;
}

const CATEGORIES: Record<string, { label: string; events: string[]; forced?: string[] }> = {
  finance: {
    label: "财务通知",
    events: ["recharge_success", "consumption_notify", "balance_low", "refund_status"],
  },
  security: {
    label: "安全通知",
    events: ["login_reminder", "key_created_deleted", "login_anomaly", "2fa_changed"],
    forced: ["login_anomaly", "2fa_changed"],
  },
  system: {
    label: "系统通知",
    events: ["system_maintenance", "api_changed", "version_update"],
  },
  marketing: {
    label: "营销通知",
    events: ["campaign_notify", "promotion_info", "product_update"],
  },
};

const EVENT_LABELS: Record<string, string> = {
  recharge_success: "充值成功",
  consumption_notify: "消费通知",
  balance_low: "余额不足",
  refund_status: "退款状态",
  login_reminder: "登录提醒",
  key_created_deleted: "Key 创建/删除",
  login_anomaly: "异常登录",
  "2fa_changed": "2FA 变更",
  system_maintenance: "系统维护",
  api_changed: "API 变更",
  version_update: "版本更新",
  campaign_notify: "活动通知",
  promotion_info: "优惠信息",
  product_update: "产品更新",
};

export default function NotificationSettingsPage() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const { data: prefs, isLoading } = useQuery<NotificationPrefs>({
    queryKey: ["me-notif-prefs"],
    queryFn: async () => (await api.get<{ data: NotificationPrefs }>("/me/preferences/notifications")).data.data,
  });

  const [localPrefs, setLocalPrefs] = useState<NotificationPrefs | null>(null);
  const effective = localPrefs ?? prefs;

  const saveMut = useMutation({
    mutationFn: async (data: NotificationPrefs) => (await api.put("/me/preferences/notifications", data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-notif-prefs"] });
      setNotice({ type: "success", msg: "✅ 通知偏好已保存" });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const resetMut = useMutation({
    mutationFn: async () => (await api.post("/me/preferences/notifications/reset")).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-notif-prefs"] });
      setLocalPrefs(null);
      setNotice({ type: "success", msg: "✅ 已恢复默认设置" });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const updateField = (field: string, value: any) => {
    if (!effective) return;
    setLocalPrefs({ ...effective, [field]: value });
  };

  const toggleEvent = (channel: "inAppPreferences" | "emailPreferences", event: string, value: boolean) => {
    if (!effective) return;
    setLocalPrefs({ ...effective, [channel]: { ...effective[channel], [event]: value } });
  };

  const handleSave = () => {
    if (!localPrefs) return;
    saveMut.mutate(localPrefs);
  };

  const handleReset = () => {
    if (confirm("确认恢复默认通知设置？")) {
      resetMut.mutate();
    }
  };

  if (isLoading) return <div style={{ fontFamily: "system-ui, sans-serif" }}>加载中...</div>;
  if (!effective) return <div style={{ fontFamily: "system-ui, sans-serif" }}>无法加载设置</div>;

  const card = { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };

  const forcedEvents = new Set(["login_anomaly", "2fa_changed"]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>通知偏好设置</h2>
        <button
          onClick={handleReset}
          style={{ background: "none", border: "1px solid #e2e8f0", color: "#64748b", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
        >
          恢复默认
        </button>
      </div>

      {/* 邮件全局设置 */}
      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>邮件通知设置</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <label style={{ fontWeight: 500, fontSize: 14 }}>邮件通知</label>
          <input
            type="checkbox"
            checked={effective.emailEnabled}
            onChange={(e) => updateField("emailEnabled", e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: 13, color: "#94a3b8" }}>{effective.emailEnabled ? "已开启" : "已关闭"}</span>
        </div>
        {effective.emailEnabled && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ fontWeight: 500, fontSize: 14 }}>接收频率</label>
            <select
              value={effective.emailFrequency}
              onChange={(e) => updateField("emailFrequency", e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
            >
              <option value="realtime">实时</option>
              <option value="daily">每日摘要（早 9:00）</option>
              <option value="off">关闭</option>
            </select>
          </div>
        )}
      </div>

      {/* 各类别通知 */}
      {Object.entries(CATEGORIES).map(([catKey, cat]) => (
        <div key={catKey} style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>{cat.label}</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b" }}>
                <th style={{ padding: "8px", textAlign: "left" }}>事件</th>
                <th style={{ padding: "8px", textAlign: "center", width: 80 }}>站内</th>
                <th style={{ padding: "8px", textAlign: "center", width: 80 }}>邮件</th>
                <th style={{ padding: "8px", textAlign: "center", width: 60 }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {cat.events.map((event) => {
                const isForced = forcedEvents.has(event);
                const inApp = effective.inAppPreferences?.[event] ?? true;
                const email = effective.emailPreferences?.[event] ?? true;
                return (
                  <tr key={event} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px", fontWeight: 500 }}>
                      {EVENT_LABELS[event] ?? event}
                      {isForced && <span style={{ marginLeft: 6, color: "#2563eb", fontSize: 11 }}>🔒</span>}
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={inApp}
                        disabled={isForced}
                        onChange={(e) => toggleEvent("inAppPreferences", event, e.target.checked)}
                        style={{ width: 18, height: 18 }}
                      />
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={email}
                        disabled={isForced || !effective.emailEnabled}
                        onChange={(e) => toggleEvent("emailPreferences", event, e.target.checked)}
                        style={{ width: 18, height: 18 }}
                      />
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      {isForced && <span style={{ fontSize: 11, color: "#94a3b8" }}>强制</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {catKey === "finance" && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>余额不足阈值：</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>¥</span>
              <input
                type="number"
                value={effective.balanceLowThreshold}
                onChange={(e) => updateField("balanceLowThreshold", parseInt(e.target.value) || 10)}
                style={{ width: 80, padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
                min={1}
              />
            </div>
          )}
        </div>
      ))}

      {/* 保存按钮 */}
      <div style={{ textAlign: "right", marginBottom: 40 }}>
        <button
          onClick={handleSave}
          disabled={!localPrefs || saveMut.isPending}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            padding: "10px 32px",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
            opacity: !localPrefs || saveMut.isPending ? 0.6 : 1,
          }}
        >
          保存所有设置
        </button>
      </div>

      {/* Toast */}
      {notice && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 1100,
          padding: "12px 20px", borderRadius: 8, color: "#fff",
          background: notice.type === "success" ? "#16a34a" : "#dc2626",
          boxShadow: "0 4px 12px rgba(0,0,0,.15)",
        }}>
          {notice.msg}
          <button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>×</button>
        </div>
      )}
    </div>
  );
}

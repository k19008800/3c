// ============================================================
//  3cloud (3C) — 管理后台告警通知组件
//  浏览器通知 + 告警弹出提示
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { useAlertStream, AlertPushData, AlertSeverity, AlertType } from "../../hooks/useAlertStream";
import { X, AlertTriangle, AlertCircle, Info, CheckCircle, Bell, BellOff } from "lucide-react";

// ── 类型定义 ──

interface AlertToast {
  id: string;
  alert: AlertPushData;
  visible: boolean;
}

// ── 配置 ──

const ALERT_TYPE_NAMES: Record<AlertType, string> = {
  failure_rate_spike: "失败率突增",
  quota_exhaustion: "配额耗尽",
  suspicious_login: "异地登录",
  abnormal_call_pattern: "异常调用",
};

const SEVERITY_CONFIG: Record<AlertSeverity, { color: string; bgColor: string; icon: typeof AlertTriangle }> = {
  critical: { color: "text-red-600", bgColor: "bg-red-50 border-red-200", icon: AlertCircle },
  warning: { color: "text-yellow-600", bgColor: "bg-yellow-50 border-yellow-200", icon: AlertTriangle },
  info: { color: "text-blue-600", bgColor: "bg-blue-50 border-blue-200", icon: Info },
};

// ── Props ──

interface AlertNotificationProps {
  alertTypes?: AlertType[];
  onAlert?: (alert: AlertPushData) => void;
  enableBrowserNotification?: boolean;
  enableToast?: boolean;
  toastDuration?: number;
  maxToasts?: number;
}

// ── 组件 ──

export function AlertNotification({
  alertTypes = [],
  onAlert,
  enableBrowserNotification = true,
  enableToast = true,
  toastDuration = 5000,
  maxToasts = 3,
}: AlertNotificationProps) {
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const [browserNotificationEnabled, setBrowserNotificationEnabled] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // ── 请求浏览器通知权限 ──
  const requestNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      console.warn("[AlertNotification] Browser does not support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      setBrowserNotificationEnabled(true);
      return true;
    }

    if (Notification.permission === "denied") {
      setPermissionDenied(true);
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setBrowserNotificationEnabled(true);
      return true;
    } else {
      setPermissionDenied(true);
      return false;
    }
  }, []);

  // ── 发送浏览器通知 ──
  const sendBrowserNotification = useCallback(
    (alert: AlertPushData) => {
      if (!browserNotificationEnabled || Notification.permission !== "granted") {
        return;
      }

      const severityIcon = {
        critical: "🔴",
        warning: "⚠️",
        info: "ℹ️",
      };

      const notification = new Notification(`${severityIcon[alert.severity]} ${alert.title}`, {
        body: alert.message,
        tag: alert.id,
        requireInteraction: alert.severity === "critical",
        icon: "/favicon.ico",
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    },
    [browserNotificationEnabled]
  );

  // ── 处理告警 ──
  const handleAlert = useCallback(
    (alert: AlertPushData) => {
      // 回调通知
      onAlert?.(alert);

      // 浏览器通知
      if (enableBrowserNotification) {
        sendBrowserNotification(alert);
      }

      // Toast 通知
      if (enableToast) {
        const toastId = `${alert.id}-${Date.now()}`;
        setToasts((prev) => {
          const newToasts = [
            ...prev,
            { id: toastId, alert, visible: true },
          ];
          // 限制最大数量
          return newToasts.slice(-maxToasts);
        });

        // 自动关闭
        setTimeout(() => {
          setToasts((prev) =>
            prev.map((t) => (t.id === toastId ? { ...t, visible: false } : t))
          );
        }, toastDuration);
      }
    },
    [onAlert, enableBrowserNotification, enableToast, toastDuration, maxToasts, sendBrowserNotification]
  );

  // ── WebSocket 连接 ──
  const { isConnected, subscribedTypes } = useAlertStream({
    alertTypes,
    onAlert: handleAlert,
    enabled: true,
  });

  // ── 初始化浏览器通知权限 ──
  useEffect(() => {
    if (enableBrowserNotification) {
      requestNotificationPermission();
    }
  }, [enableBrowserNotification, requestNotificationPermission]);

  // ── 关闭 Toast ──
  const closeToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  // ── Toast 组件 ──
  const ToastItem = ({ toast }: { toast: AlertToast }) => {
    const config = SEVERITY_CONFIG[toast.alert.severity];
    const Icon = config.icon;

    return (
      <div
        className={`border rounded-lg shadow-lg p-4 transition-all duration-300 ${config.bgColor} ${
          toast.visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
        }`}
      >
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 mt-0.5 ${config.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className={`font-medium text-sm ${config.color}`}>
                {toast.alert.title}
              </h4>
              <button
                onClick={() => closeToast(toast.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
              {toast.alert.message}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">
                {ALERT_TYPE_NAMES[toast.alert.type]}
              </span>
              <button
                onClick={() => {
                  // 跳转到详情页
                  if (toast.alert.metadata?.detailPath) {
                    window.location.href = toast.alert.metadata.detailPath;
                  }
                  closeToast(toast.id);
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                查看详情
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ── Toast 容器 ── */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)]">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </div>

      {/* ── 连接状态指示器（可选）── */}
      <div className="fixed bottom-4 right-4 z-40">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
            isConnected
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {isConnected ? (
            <>
              <Bell className="w-3.5 h-3.5" />
              <span>告警订阅中</span>
            </>
          ) : (
            <>
              <BellOff className="w-3.5 h-3.5" />
              <span>未连接</span>
            </>
          )}
        </div>
      </div>

      {/* ── 浏览器通知权限提示（可选）── */}
      {enableBrowserNotification && permissionDenied && (
        <div className="fixed bottom-16 right-4 z-40 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 max-w-xs">
          <p className="font-medium">浏览器通知已禁用</p>
          <p className="mt-1 text-yellow-700">
            请在浏览器设置中允许通知，以接收告警提醒。
          </p>
        </div>
      )}
    </>
  );
}

// ── 导出简化版组件 ──

export function AlertNotificationMinimal() {
  return (
    <AlertNotification
      alertTypes={["failure_rate_spike", "quota_exhaustion", "suspicious_login", "abnormal_call_pattern"]}
      enableBrowserNotification={true}
      enableToast={true}
    />
  );
}
// ============================================================
//  3cloud (3C) — 实时通知组件
//  用户级实时告警推送，支持浏览器通知、Toast提示、通知中心
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRealTimeAlerts, AlertItem, AlertSeverity } from "../hooks/useRealTimeAlerts.ts";
import { 
  Bell, 
  BellOff, 
  X, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle,
  Settings,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Moon,
  Sun
} from "lucide-react";

// ── 类型定义 ──

interface ToastNotification {
  id: string;
  alert: AlertItem;
  visible: boolean;
  timestamp: number;
}

interface NotificationCenterProps {
  alerts: AlertItem[];
  onAcknowledge: (alertId: string) => void;
  onViewAll: () => void;
}

interface NotificationPreferencesModalProps {
  preferences: any;
  onUpdate: (prefs: any) => Promise<boolean>;
  onClose: () => void;
}

// ── 组件配置 ──

const ALERT_LEVEL_CONFIG: Record<AlertSeverity, {
  color: string;
  bgColor: string;
  icon: typeof AlertTriangle;
  text: string;
}> = {
  critical: { 
    color: "text-red-600", 
    bgColor: "bg-red-50 border-red-200", 
    icon: AlertCircle,
    text: "严重"
  },
  error: { 
    color: "text-red-500", 
    bgColor: "bg-red-50 border-red-200", 
    icon: AlertCircle,
    text: "错误"
  },
  warning: { 
    color: "text-yellow-600", 
    bgColor: "bg-yellow-50 border-yellow-200", 
    icon: AlertTriangle,
    text: "警告"
  },
  info: { 
    color: "text-blue-600", 
    bgColor: "bg-blue-50 border-blue-200", 
    icon: Info,
    text: "信息"
  },
};

const ALERT_TYPE_NAMES: Record<string, string> = {
  failure_rate_spike: "失败率突增",
  quota_exhaustion: "配额耗尽",
  suspicious_login: "异地登录",
  abnormal_call_pattern: "异常调用",
};

// ── Props ──

interface RealTimeNotificationProps {
  // 显示选项
  showBell?: boolean;               // 显示通知铃铛
  showToast?: boolean;              // 显示Toast通知
  showNotificationCenter?: boolean; // 显示通知中心按钮
  enableBrowserNotifications?: boolean; // 启用浏览器通知
  
  // 配置选项
  toastDuration?: number;           // Toast显示时长(ms)
  maxToasts?: number;               // 最大Toast数量
  autoAcknowledgeAfter?: number;    // 自动确认时间(ms)
  
  // 回调函数
  onAlertClick?: (alert: AlertItem) => void;
  onPreferencesOpen?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

// ── Toast 通知组件 ──

const ToastItem = ({ 
  toast, 
  onClose, 
  onClick 
}: { 
  toast: ToastNotification; 
  onClose: (id: string) => void;
  onClick: (alert: AlertItem) => void;
}) => {
  const config = ALERT_LEVEL_CONFIG[toast.alert.level];
  const Icon = config.icon;
  const timeAgo = useMemo(() => {
    const seconds = Math.floor((Date.now() - toast.timestamp) / 1000);
    if (seconds < 60) return `${seconds}秒前`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
    return `${Math.floor(seconds / 3600)}小时前`;
  }, [toast.timestamp]);

  return (
    <div
      className={`
        border rounded-lg shadow-lg p-4 mb-2 transition-all duration-300 
        ${config.bgColor}
        ${toast.visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"}
        hover:shadow-md cursor-pointer
      `}
      onClick={() => onClick(toast.alert)}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className={`font-medium text-sm ${config.color}`}>
                {toast.alert.title}
              </h4>
              <span className="text-xs text-gray-500">{timeAgo}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(toast.id);
              }}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
            {toast.alert.message}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {ALERT_TYPE_NAMES[toast.alert.type] || toast.alert.type}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
              {config.text}
            </span>
            {toast.alert.detailPath && (
              <button 
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = toast.alert.detailPath!;
                }}
              >
                查看详情
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── 通知中心组件 ──

const NotificationCenter = ({ 
  alerts, 
  onAcknowledge, 
  onViewAll 
}: NotificationCenterProps) => {
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  if (alerts.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <BellOff className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p className="text-lg font-medium">暂无未读通知</p>
        <p className="text-sm mt-1">所有通知都已处理完毕</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {alerts.map((alert) => {
        const config = ALERT_LEVEL_CONFIG[alert.level];
        const Icon = config.icon;
        const isExpanded = expandedAlert === alert.id;
        const timeAgo = Math.floor((Date.now() - new Date(alert.createdAt).getTime()) / 1000);
        const timeText = timeAgo < 60 ? `${timeAgo}秒前` : 
                        timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}分钟前` : 
                        `${Math.floor(timeAgo / 3600)}小时前`;

        return (
          <div
            key={alert.id}
            className={`p-4 hover:bg-gray-50 transition-colors ${alert.acknowledged ? "opacity-70" : ""}`}
          >
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className={`font-medium text-sm ${config.color}`}>
                      {alert.title}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {ALERT_TYPE_NAMES[alert.type] || alert.type} · {timeText}
                    </p>
                  </div>
                  {!alert.acknowledged && (
                    <button
                      onClick={() => onAcknowledge(alert.id)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1 rounded-full border border-blue-200 bg-blue-50 hover:bg-blue-100"
                    >
                      标记已读
                    </button>
                  )}
                </div>
                
                <p className={`text-sm text-gray-600 mt-2 ${isExpanded ? "" : "line-clamp-2"}`}>
                  {alert.message}
                </p>

                {!isExpanded && alert.message.length > 100 && (
                  <button
                    onClick={() => setExpandedAlert(alert.id)}
                    className="text-xs text-gray-500 hover:text-gray-700 mt-1"
                  >
                    显示更多
                  </button>
                )}

                {isExpanded && (
                  <div className="mt-2">
                    {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                      <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded mt-2">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(alert.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                    <button
                      onClick={() => setExpandedAlert(null)}
                      className="text-xs text-gray-500 hover:text-gray-700 mt-2"
                    >
                      收起
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-3">
                  {alert.detailPath && (
                    <a
                      href={alert.detailPath}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      onClick={(e) => {
                        e.preventDefault();
                        window.location.href = alert.detailPath!;
                      }}
                    >
                      查看详情
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      
      <div className="p-4 text-center">
        <button
          onClick={onViewAll}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          查看所有通知
        </button>
      </div>
    </div>
  );
};

// ── 主组件 ──

export function RealTimeNotification({
  showBell = true,
  showToast = true,
  showNotificationCenter = true,
  enableBrowserNotifications = true,
  toastDuration = Column 7000,
  maxToasts = 3,
  autoAcknowledgeAfter = 30000,
  onAlertClick,
  onPreferencesOpen,
  onConnectionChange
}: RealTimeNotificationProps) {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [showCenter, setShowCenter] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  
  const {
    isConnected,
    isLoading,
    alerts,
    stats,
    preferences,
    acknowledgeAlert,
    refreshAlerts,
    updatePreferences,
    browserNotificationsEnabled,
    requestNotificationPermission
  } = useRealTimeAlerts({
    autoConnect: true,
    enableBrowserNotifications,
    onAlert: handleNewAlert,
    onAlertsUpdate: handleAlertsUpdate,
    onConnectionChange
  });

  // ── 处理新告警 ──
  function handleNewAlert(alert: any) {
    const toastId = `${alert.id}-${Date.now()}`;
    setToasts(prev => {
      const newToast: ToastNotification = {
        id: toastId,
        alert: {
          id: alert.id,
          type: alert.type,
          level: alert.severity,
          title: alert.title,
          message: alert.message,
          createdAt: alert.createdAt.toISOString(),
          acknowledged: false,
          metadata: alert.metadata
        },
        visible: true,
        timestamp: Date.now()
      };
      
      // 添加新Toast并限制数量
      const newToasts = [newToast, ...prev].slice(0, maxToasts);
      return newToasts;
    });

    // 自动关闭Toast
    setTimeout(() => {
      setToasts(prev => prev.map(t => 
        t.id === toastId ? { ...t, visible: false } : t
      ));
    }, toastDuration);

    // 自动确认（可选）
    if (autoAcknowledgeAfter > 0) {
      setTimeout(() => {
        acknowledgeAlert(alert.id, 'acknowledge');
        setToasts(prev => prev.filter(t => t.id !== toastId));
      }, autoAcknowledgeAfter);
    }
  }

  // ── 处理告警更新 ──
  function handleAlertsUpdate(data: any) {
    // 可以在这里处理统计数据的更新显示
  }

  // ── 关闭Toast ──
  const closeToast = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  }, []);

  // ── 点击告警 ──
  const handleAlertClick = useCallback((alert: AlertItem) => {
    onAlertClick?.(alert);
    
    // 如果没有已确认，自动标记为已读
    if (!alert.acknowledged) {
      acknowledgeAlert(alert.id, 'acknowledge');
    }
    
    // 跳转到详情页
    if (alert.detailPath) {
      window.location.href = alert.detailPath;
    }
  }, [onAlertClick, acknowledgeAlert]);

  // ── 未读告警数量 ──
  const unreadCount = useMemo(() => 
    alerts.filter(a => !a.acknowledged).length,
    [alerts]
  );

  // ── 通知铃铛组件 ──
  const BellIcon = () => {
    if (!showBell) return null;

    return (
      <div className="relative">
        <button
          onClick={() => setShowCenter(!showCenter)}
          className={`
            p-2 rounded-full transition-colors
            ${isLoading ? "bg-gray-100 text-gray-400" : 
              unreadCount > 0 ? "bg-red-50 text-red-600 hover:bg-red-100" :
              "bg-gray-100 text-gray-600 hover:bg-gray-200"}
          `}
          title={isLoading ? "连接中..." : `未读通知: ${unreadCount}`}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
          ) : unreadCount > 0 ? (
            <Bell className="w-5 h-5" />
          ) : (
            <BellOff className="w-5 h-5" />
          )}
        </button>
        
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
    );
  };

  // ── 连接状态指示器 ──
  const ConnectionStatus = () => (
    <div className={`text-xs px-2 py-1 rounded-full ${isConnected ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
      {isConnected ? "实时连接" : "未连接"}
    </div>
  );

  // ── 统计摘要 ──
  const StatsSummary = () => {
    if (!stats) return null;

    return (
      <div className="flex items-center gap-4 text-sm">
        {stats.critical > 0 && (
          <span className="text-red-600">
            <AlertCircle className="w-4 h-4 inline mr-1" />
            严重: {stats.critical}
          </span>
        )}
        {stats.error > 0 && (
          <span className="text-red-500">
            <AlertCircle className="w-4 h-4 inline mr-1" />
            错误: {stats.error}
          </span>
        )}
        {stats.warning > 0 && (
          <span className="text-yellow-600">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            警告: {stats.warning}
          </span>
        )}
        <span className="text-gray-500">
          总计: {stats.total}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* ── Toast 容器 ── */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)]">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onClose={closeToast}
              onClick={handleAlertClick}
            />
          ))}
        </div>
      )}

      {/* ── 通知控制栏 ── */}
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
        {showNotificationCenter && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-lg">
            <div className="flex items-center gap-3 p-3">
              <BellIcon />
              <StatsSummary />
              <ConnectionStatus />
              
              <button
                onClick={() => setShowPreferences(true)}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                title="通知设置"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 通知中心弹窗 ── */}
      {showCenter && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-start justify-end p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden">
            <div className="border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  通知中心
                  {unreadCount > 0 && (
                    <span className="ml-2 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                      {unreadCount} 未读
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={refreshAlerts}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    刷新
                  </button>
                  <button
                    onClick={() => setShowCenter(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="overflow-y-auto max-h-[calc(80vh-8rem)]">
              <NotificationCenter
                alerts={alerts}
                onAcknowledge={(alertId) => acknowledgeAlert(alertId, 'acknowledge')}
                onViewAll={() => {
                  setShowCenter(false);
                  window.location.href = '/notifications';
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 浏览器通知权限提示 ── */}
      {enableBrowserNotifications && !browserNotificationsEnabled && (
        <div className="fixed bottom-20 right-4 z-40 bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-w-xs">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-yellow-600" />
            <p className="font-medium text-yellow-800">启用浏览器通知</p>
          </div>
          <p className="text-sm text-yellow-700 mb-2">
            开启浏览器通知，及时接收重要告警
          </p>
          <button
            onClick={requestNotificationPermission}
            className="text-sm bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded"
          >
            启用通知
          </button>
        </div>
      )}
    </>
  );
}

// ── 导出简化版本 ──

export function RealTimeNotificationMinimal() {
  return (
    <RealTimeNotification
      showBell={true}
      showToast={true}
      showNotificationCenter={false}
      enableBrowserNotifications={true}
    />
  );
}

export function RealTimeNotificationBellOnly() {
  return (
    <div className="fixed bottom-4 right-4 z-40">
      <RealTimeNotification
        showBell={true}
        showToast={false}
        showNotificationCenter={false}
        enableBrowserNotifications={false}
      />
    </div>
  );
}
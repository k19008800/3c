// ============================================================
//  3cloud (3C) — 用户实时告警 WebSocket Hook
//  管理实时告警订阅、通知偏好、浏览器通知
// ============================================================

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useAuth } from "./use-auth.tsx";

// ── 类型定义 ──

export type AlertSeverity = "info" | "warning" | "error" | "critical";
export type AlertType =
  | "failure_rate_spike"
  | "quota_exhaustion"
  | "suspicious_login"
  | "abnormal_call_pattern";

export interface AlertPushData {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata: Record<string, any>;
  createdAt: Date;
  type: AlertType;
}

export interface AlertItem {
  id: string;
  type: AlertType;
  level: AlertSeverity;
  title: string;
  message: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  metadata?: Record<string, any>;
  detailPath?: string;
}

export interface AlertCenterData {
  alerts: AlertItem[];
  stats: {
    total: number;
    critical: number;
    error: number;
    warning: number;
    info: number;
    unacknowledged: number;
  };
}

export interface NotificationPreferences {
  subscriptions: Array<{ type: string; subscribed: boolean }>;
  settings: {
    browserNotifications: boolean;
    mobilePush: boolean;
    emailNotifications: boolean;
    quietHours: {
      enabled: boolean;
      start: string;
      end: string;
    };
    criticalAlertsAlways: boolean;
    soundEnabled: boolean;
    vibrationEnabled: boolean;
  };
  alertFilters: {
    enabledLevels: string[];
    minimumLevel: string;
  };
}

// ── WebSocket 消息类型 ──

interface WSMessage {
  action: string;
  [key: string]: any;
}

// ── Hook 配置 ──

interface UseRealTimeAlertsOptions {
  autoConnect?: boolean;
  enableBrowserNotifications?: boolean;
  onAlert?: (alert: AlertPushData) => void;
  onAlertsUpdate?: (data: AlertCenterData) => void;
  onConnectionChange?: (connected: boolean) => void;
  onPreferencesLoaded?: (prefs: NotificationPreferences) => void;
}

// ── Hook 返回值 ──

interface UseRealTimeAlertsReturn {
  // 连接状态
  isConnected: boolean;
  isLoading: boolean;
  
  // 数据
  alerts: AlertItem[];
  stats: AlertCenterData['stats'] | null;
  preferences: NotificationPreferences | null;
  
  // WebSocket 操作
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  
  // 订阅管理
  subscribe: (types: string[]) => void;
  unsubscribe: () => void;
  
  // 告警操作
  acknowledgeAlert: (alertId: string, action: 'acknowledge' | 'ignore') => Promise<boolean>;
  refreshAlerts: () => Promise<void>;
  
  // 偏好设置
  updatePreferences: (preferences: Partial<NotificationPreferences>) => Promise<boolean>;
  loadPreferences: () => Promise<void>;
  
  // 浏览器通知
  requestNotificationPermission: () => Promise<boolean>;
  browserNotificationsEnabled: boolean;
}

// ── 默认配置 ──

const DEFAULT_WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/alerts`;
const DEFAULT_RECONNECT_DELAY =  
const DEFAULT_PING_INTERVAL = 30000;

// ── Hook 实现 ──

export function useRealTimeAlerts(options: UseRealTimeAlertsOptions = {}): UseRealTimeAlertsReturn {
  const {
    autoConnect = true,
    enableBrowserNotifications = true,
    onAlert,
    onAlertsUpdate,
    onConnectionChange,
    onPreferencesLoaded
  } = options;

  const { user, token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [stats, setStats] = useState<AlertCenterData['stats'] | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // ── 清理定时器 ──
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  // ── 发送 WebSocket 消息 ──
  const sendWsMessage = useCallback((action: string, data?: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...data }));
    }
  }, []);

  // ── 请求浏览器通知权限 ──
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (!("Notification" in window)) {
      console.warn("[RealTimeAlerts] Browser does not support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      setBrowserNotificationsEnabled(true);
      return true;
    }

    if (Notification.permission === "denied") {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === "granted";
      setBrowserNotificationsEnabled(granted);
      return granted;
    } catch (err) {
      console.error("[RealTimeAlerts] Notification permission error:", err);
      return false;
    }
  }, []);

  // ── 发送浏览器通知 ──
  const sendBrowserNotification = useCallback((alert: AlertPushData) => {
    if (!browserNotificationsEnabled || Notification.permission !== "granted") {
      return;
    }

    // 检查静默时段
    if (preferences?.settings.quietHours.enabled) {
      const now = new Date();
      const [startHour, startMinute] = preferences.settings.quietHours.start.split(':').map(Number);
      const [endHour, endMinute] = preferences.settings.quietHours.end.split(':').map(Number);
      
      const startTime = new Date();
      startTime.setHours(startHour, startMinute, 0, 0);
      
      const endTime = new Date();
      endTime.setHours(endHour, endMinute, 0, 0);
      
      // 处理跨天的情况
      if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
      }
      
      if (now >= startTime && now < endTime && alert.severity !== 'critical') {
        return; // 静默时段，非关键告警不发送
      }
    }

    // 检查告警级别过滤
    if (!preferences?.alertFilters.enabledLevels.includes(alert.severity)) {
      return;
    }

    const icons = {
      critical: "🔴",
      error: "🔴",
      warning: "🟡",
      info: "🔵"
    };

    const notification = new Notification(`${icons[alert.severity] || 'ℹ️'} ${alert.title}`, {
      body: alert.message,
      tag: alert.id,
      requireInteraction: alert.severity === "critical" || alert.severity === "error",
      icon: "/favicon.ico",
      silent: !preferences?.settings.soundEnabled
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      // 可以添加跳转到详情页的逻辑
      if (alert.metadata?.detailPath) {
        window.location.href = alert.metadata.detailPath;
      }
    };
  }, [browserNotificationsEnabled, preferences]);

  // ── 加载通知偏好 ──
  const loadPreferences = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch('/api/v1/me/notifications/preferences', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPreferences(data);
          onPreferencesLoaded?.(data);
          
          // 如果启用了浏览器通知，请求权限
          if (data.settings.browserNotifications && enableBrowserNotifications) {
            await requestNotificationPermission();
          }
        }
      }
    } catch (error) {
      console.error("[RealTimeAlerts] Load preferences error:", error);
    }
  }, [token, enableBrowserNotifications, requestNotificationPermission, onPreferencesLoaded]);

  // ── 更新通知偏好 ──
  const updatePreferences = useCallback(async (newPreferences: Partial<NotificationPreferences>): Promise<boolean> => {
    if (!token) return false;

    try {
      const response = await fetch('/api/v1/me/notifications/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newPreferences)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          await loadPreferences(); // 重新加载更新后的偏好
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("[RealTimeAlerts] Update preferences error:", error);
      return false;
    }
  }, [token, loadPreferences]);

  // ── 确认告警 ──
  const acknowledgeAlert = useCallback(async (alertId: string, action: 'acknowledge' | 'ignore'): Promise<boolean> => {
    sendWsMessage('acknowledge', { alertId, action });
    
    // 更新本地状态
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, acknowledged: true, acknowledgedAt: new Date().toISOString() } : alert
    ));
    
    // 更新统计数据
    setStats(prev => prev ? {
      ...prev,
      unacknowledged: Math.max(0, prev.unacknowledged - 1)
    } : prev);

    return true;
  }, [sendWsMessage]);

  // ── 刷新告警列表 ──
  const refreshAlerts = useCallback(async () => {
    sendWsMessage('get_alerts');
  }, [sendWsMessage]);

  // ── 订阅告警 ──
  const subscribe = useCallback((types: string[]) => {
    sendWsMessage('subscribe', { types });
  }, [sendWsMessage]);

  // ── 取消订阅 ──
  const unsubscribe = useCallback(() => {
    sendWsMessage('unsubscribe');
  }, [sendWsMessage]);

  // ── 心跳机制 ──
  const startHeartbeat = useCallback(() => {
    heartbeatTimerRef.current = setInterval(() => {
      sendWsMessage('heartbeat');
    }, 30000); // 30秒心跳
  }, [sendWsMessage]);

  // ── 建立 WebSocket 连接 ──
  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return;

    clearTimers();

    try {
      const ws = new WebSocket(`${DEFAULT_WS_URL}`);
      wsRef.current = ws;
      setIsLoading(true);

      ws.onopen = () => {
        setIsConnected(true);
        setIsLoading(false);
        onConnectionChange?.(true);
        startHeartbeat();

        // 加载偏好设置
        loadPreferences();

        // 自动订阅
        if (preferences?.subscriptions) {
          const subscribedTypes = preferences.subscriptions
            .filter(s => s.subscribed)
            .map(s => s.type);
          if (subscribedTypes.length > 0) {
            subscribe(subscribedTypes);
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'connected':
              console.log('[RealTimeAlerts] WebSocket connected:', data.message);
              break;
              
            case 'subscribed':
              console.log('[RealTimeAlerts] Subscribed to:', data.subscribedTypes);
              break;
              
            case 'alerts':
              setAlerts(data.data.alerts);
              setStats(data.data.stats);
              onAlertsUpdate?.(data.data);
              break;
              
            case 'alert':
              const alert = data.data;
              onAlert?.(alert);
              
              // 发送浏览器通知
              if (enableBrowserNotifications && browserNotificationsEnabled) {
                sendBrowserNotification(alert);
              }
              
              // 更新本地列表
              setAlerts(prev => [{
                id: alert.id,
                type: alert.type,
                level: alert.severity,
                title: alert.title,
                message: alert.message,
                createdAt: alert.createdAt.toISOString(),
                acknowledged: false,
                metadata: alert.metadata
              }, ...prev]);
              
              // 更新统计数据
              setStats(prev => prev ? {
                ...prev,
                total: prev.total + 1,
                [alert.severity]: (prev[alert.severity as keyof typeof prev] || 0) + 1,
                unacknowledged: prev.unacknowledged + 1
              } : null);
              break;
              
            case 'acknowledged':
              console.log('[RealTimeAlerts] Alert acknowledged:', data.alertId);
              break;
              
            case 'heartbeat':
              // 心跳响应
              break;
              
            case 'error':
              console.error('[RealTimeAlerts] WebSocket error:', data.message);
              break;
          }
        } catch (err) {
          console.error('[RealTimeAlerts] Message parse error:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('[RealTimeAlerts] WebSocket error:', error);
        setIsLoading(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsLoading(false);
        onConnectionChange?.(false);
        clearTimers();

        // 自动重连
        if (mountedRef.current && autoConnect) {
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      };
    } catch (err) {
      console.error('[RealTimeAlerts] Connection error:', err);
      setIsLoading(false);
    }
  }, [
    token, autoConnect, enableBrowserNotifications, browserNotificationsEnabled,
    preferences, onAlert, onAlertsUpdate, onConnectionChange,
    clearTimers, startHeartbeat, loadPreferences, subscribe, sendBrowserNotification
  ]);

  // ── 断开连接 ──
  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [clearTimers]);

  // ── 重连 ──
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(connect, 1000);
  }, [disconnect, connect]);

  // ── 初始化 ──
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect && token) {
      connect();
    }

    // 初始加载偏好设置
    if (token) {
      loadPreferences();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [autoConnect, token, connect, disconnect, loadPreferences]);

  // ── 监听 token 变化 ──
  useEffect(() => {
    if (token && autoConnect && !isConnected) {
      connect();
    }
  }, [token, autoConnect, isConnected, connect]);

  return {
    isConnected,
    isLoading,
    alerts,
    stats,
    preferences,
    connect,
    disconnect,
    reconnect,
    subscribe,
    unsubscribe,
    acknowledgeAlert,
    refreshAlerts,
    updatePreferences,
    loadPreferences,
    requestNotificationPermission,
    browserNotificationsEnabled
  };
}
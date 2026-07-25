// ============================================================
//  3cloud (3C) — 告警实时推送 WebSocket Hook
//  管理后台实时告警订阅
// ============================================================

import { useEffect, useRef, useCallback, useState } from "react";

// ── 类型定义 ──

export type AlertSeverity = "info" | "warning" | "critical";
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

export interface AlertPushMessage {
  type: "alert";
  data: AlertPushData;
}

export interface ConnectedMessage {
  type: "connected";
  userId: number;
  message: string;
}

export interface SubscribedMessage {
  type: "subscribed";
  alertTypes: string[];
}

export interface PongMessage {
  type: "pong";
  timestamp: number;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

type WSMessage =
  | AlertPushMessage
  | ConnectedMessage
  | SubscribedMessage
  | PongMessage
  | ErrorMessage;

// ── Hook 配置 ──

interface UseAlertStreamOptions {
  url?: string;
  alertTypes?: AlertType[];
  onAlert?: (alert: AlertPushData) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  reconnectInterval?: number;
  pingInterval?: number;
  enabled?: boolean;
}

// ── Hook 返回值 ──

interface UseAlertStreamReturn {
  isConnected: boolean;
  subscribedTypes: string[];
  subscribe: (types: AlertType[]) => void;
  unsubscribe: (types: AlertType[]) => void;
  disconnect: () => void;
  reconnect: () => void;
}

// ── 默认配置 ──

const DEFAULT_WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/v1/admin/alerts/stream`;
const DEFAULT_RECONNECT_INTERVAL = 5000;
const DEFAULT_PING_INTERVAL = 30000;

// ── Hook 实现 ──

export function useAlertStream(options: UseAlertStreamOptions = {}): UseAlertStreamReturn {
  const {
    url = DEFAULT_WS_URL,
    alertTypes = [],
    onAlert,
    onConnected,
    onDisconnected,
    onError,
    reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
    pingInterval = DEFAULT_PING_INTERVAL,
    enabled = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [subscribedTypes, setSubscribedTypes] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
  }, []);

  // ── 发送消息 ──
  const sendMessage = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // ── 订阅告警类型 ──
  const subscribe = useCallback((types: AlertType[]) => {
    sendMessage({ type: "subscribe", alertTypes: types });
  }, [sendMessage]);

  // ── 取消订阅 ──
  const unsubscribe = useCallback((types: AlertType[]) => {
    sendMessage({ type: "unsubscribe", alertTypes: types });
  }, [sendMessage]);

  // ── 断开连接 ──
  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setSubscribedTypes([]);
  }, [clearTimers]);

  // ── 心跳检测 ──
  const startPing = useCallback(() => {
    pingIntervalRef.current = setInterval(() => {
      sendMessage({ type: "ping" });
    }, pingInterval);
  }, [pingInterval, sendMessage]);

  // ── 建立连接 ──
  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;

    // 获取 token
    const token = localStorage.getItem("accessToken");
    if (!token) {
      onError?.("未找到访问令牌");
      return;
    }

    // 构造 WebSocket URL（带 token）
    const wsUrl = `${url}?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        onConnected?.();
        startPing();

        // 自动订阅配置的告警类型
        if (alertTypes.length > 0) {
          subscribe(alertTypes);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);

          switch (msg.type) {
            case "alert":
              onAlert?.(msg.data);
              break;

            case "connected":
              console.log("[AlertStream] Connected:", msg.message);
              break;

            case "subscribed":
              setSubscribedTypes(msg.alertTypes);
              break;

            case "pong":
              // 心跳响应，无需处理
              break;

            case "error":
              onError?.(msg.message);
              break;
          }
        } catch (err) {
          console.error("[AlertStream] Message parse error:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("[AlertStream] WebSocket error:", err);
        onError?.("WebSocket 连接错误");
      };

      ws.onclose = () => {
        setIsConnected(false);
        setSubscribedTypes([]);
        onDisconnected?.();
        clearTimers();

        // 自动重连
        if (enabled && mountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        }
      };
    } catch (err) {
      console.error("[AlertStream] Connection error:", err);
      onError?.("无法建立 WebSocket 连接");
    }
  }, [
    enabled,
    url,
    alertTypes,
    onConnected,
    onDisconnected,
    onError,
    reconnectInterval,
    clearTimers,
    startPing,
    subscribe,
  ]);

  // ── 重连 ──
  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [disconnect, connect]);

  // ── 生命周期 ──
  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected,
    subscribedTypes,
    subscribe,
    unsubscribe,
    disconnect,
    reconnect,
  };
}

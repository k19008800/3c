// ============================================================
//  3cloud (3C) — 实时活动流 WebSocket Hook
//  管理连接、重连、消息队列
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './use-auth';

// ── 类型定义 ──

export interface ActivityEvent {
  id: string;
  timestamp: Date;
  model: string;
  status: 'success' | 'error';
  inputTokens: number;
  outputTokens: number;
  cost: number;
  keyName?: string;
}

interface UseActivityFeedOptions {
  maxEvents?: number;
  autoConnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

interface UseActivityFeedReturn {
  events: ActivityEvent[];
  isConnected: boolean;
  isPaused: boolean;
  pause: () => void;
  resume: () => void;
  reconnect: () => void;
  clearEvents: () => void;
}

// ── Hook 实现 ──

export function useActivityFeed(options: UseActivityFeedOptions = {}): UseActivityFeedReturn {
  const {
    maxEvents = 50,
    autoConnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const { user } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef = useRef(false);

  // 清理定时器
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (!user || socketRef.current?.readyState === WebSocket.OPEN) return;

    // 构建 WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = localStorage.getItem('accessToken');

    if (!token) {
      console.warn('[ActivityFeed] No access token found');
      return;
    }

    const wsUrl = `${protocol}//${host}/ws/activity?token=${token}`;

    try {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('[ActivityFeed] WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case 'connected':
              console.log('[ActivityFeed] Server confirmed connection:', message.message);
              break;

            case 'activity':
              // 新活动事件
              setEvents((prev) => {
                const newEvents = [message.data, ...prev];
                return newEvents.slice(0, maxEvents);
              });
              break;

            case 'queued_events':
              // 恢复时发送的队列事件
              setEvents((prev) => {
                const newEvents = [...message.data, ...prev];
                return newEvents.slice(0, maxEvents);
              });
              break;

            case 'paused':
              setIsPaused(true);
              isPausedRef.current = true;
              break;

            case 'resumed':
              setIsPaused(false);
              isPausedRef.current = false;
              break;

            case 'heartbeat':
              // 心跳，无需处理
              break;

            case 'error':
              console.error('[ActivityFeed] Server error:', message.message);
              break;

            default:
              console.warn('[ActivityFeed] Unknown message type:', message.type);
          }
        } catch (err) {
          console.error('[ActivityFeed] Message parse error:', err);
        }
      };

      socket.onerror = (err) => {
        console.error('[ActivityFeed] WebSocket error:', err);
      };

      socket.onclose = (event) => {
        console.log('[ActivityFeed] WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        socketRef.current = null;

        // 自动重连
        if (autoConnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`[ActivityFeed] Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

          clearReconnectTimer();
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };
    } catch (err) {
      console.error('[ActivityFeed] WebSocket creation error:', err);
    }
  }, [user, autoConnect, reconnectDelay, maxReconnectAttempts, maxEvents, clearReconnectTimer]);

  // 断开连接
  const disconnect = useCallback(() => {
    clearReconnectTimer();
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
  }, [clearReconnectTimer]);

  // 暂停
  const pause = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action: 'pause' }));
    }
  }, []);

  // 恢复
  const resume = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action: 'resume' }));
    }
  }, []);

  // 手动重连
  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  // 清空事件
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // 自动连接
  useEffect(() => {
    if (autoConnect && user) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, user, connect, disconnect]);

  return {
    events,
    isConnected,
    isPaused,
    pause,
    resume,
    reconnect,
    clearEvents,
  };
}

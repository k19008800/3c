// ============================================================
//  3cloud (3C) — 告警实时推送服务
//  管理 WebSocket 连接、订阅、推送
// ============================================================

import { Redis } from "ioredis";
import { getRedis } from "../redis.js";

// ── 类型定义 ──

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType = 'failure_rate_spike' | 'quota_exhaustion' | 'suspicious_login' | 'abnormal_call_pattern';

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
  type: 'alert';
  data: AlertPushData;
}

export type AlertPushCallback = (message: AlertPushMessage) => void;

// ── 连接管理 ──

interface ConnectionInfo {
  userId: number;
  subscribedTypes: Set<string>;
  callback: AlertPushCallback;
}

// 内存连接表（单实例）
const connections = new Map<number, ConnectionInfo>();

// Redis Pub/Sub（多实例支持）
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;
const ALERT_CHANNEL = "3cloud:alerts:push";

// ── 初始化 Redis Pub/Sub ──

async function initRedisPubSub() {
  if (redisPub && redisSub) return;

  try {
    redisPub = getRedis().duplicate();
    redisSub = getRedis().duplicate();

    redisSub.subscribe(ALERT_CHANNEL);
    redisSub.on("message", (_channel: string, message: string) => {
      try {
        const pushMsg: AlertPushMessage = JSON.parse(message);
        const alert = pushMsg.data;

        // 分发给所有订阅了该类型的本地连接
        for (const [userId, conn] of connections) {
          if (conn.subscribedTypes.has(alert.type) || conn.subscribedTypes.size === 0) {
            conn.callback(pushMsg);
          }
        }
      } catch (err) {
        console.error("[AlertPush] Redis message parse error:", err);
      }
    });
  } catch (err) {
    console.error("[AlertPush] Redis init error:", err);
  }
}

// ── 订阅告警 ──

export function subscribeToAlerts(
  userId: number,
  types: Set<string>,
  callback: AlertPushCallback
): void {
  // 初始化 Redis
  initRedisPubSub().catch(() => {});

  // 存储连接信息
  connections.set(userId, {
    userId,
    subscribedTypes: types,
    callback,
  });
}

// ── 取消订阅 ──

export function unsubscribeFromAlerts(userId: number): void {
  connections.delete(userId);
}

// ── 推送告警（供其他服务调用）──

export async function pushAlert(alert: AlertPushData): Promise<void> {
  // 初始化 Redis
  await initRedisPubSub();

  const message: AlertPushMessage = {
    type: "alert",
    data: alert,
  };

  // 本地推送
  for (const [userId, conn] of connections) {
    if (conn.subscribedTypes.has(alert.type) || conn.subscribedTypes.size === 0) {
      conn.callback(message);
    }
  }

  // Redis Pub/Sub（跨实例）
  if (redisPub) {
    await redisPub.publish(ALERT_CHANNEL, JSON.stringify(message));
  }
}

// ── 批量推送 ──

export async function pushAlerts(alerts: AlertPushData[]): Promise<void> {
  await Promise.all(alerts.map(pushAlert));
}

// ── 获取连接统计 ──

export function getConnectionStats(): { total: number; users: number[] } {
  return {
    total: connections.size,
    users: Array.from(connections.keys()),
  };
}

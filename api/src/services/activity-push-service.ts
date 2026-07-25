// ============================================================
//  3cloud (3C) — 活动流实时推送服务
//  管理 WebSocket 连接、订阅、推送
// ============================================================

import { Redis } from "ioredis";
import { getRedis } from "../redis.js";

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

export interface ActivityPushMessage {
  type: 'activity';
  data: ActivityEvent;
}

export type ActivityPushCallback = (event: ActivityEvent) => void;

// ── 连接管理 ──

interface ConnectionInfo {
  userId: number;
  callback: ActivityPushCallback;
}

// 内存连接表（单实例）
const connections = new Map<number, ConnectionInfo>();

// Redis Pub/Sub（多实例支持）
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;
const ACTIVITY_CHANNEL = "3cloud:activity:push";

// ── 初始化 Redis Pub/Sub ──

async function initRedisPubSub() {
  if (redisPub && redisSub) return;

  try {
    redisPub = getRedis().duplicate();
    redisSub = getRedis().duplicate();

    redisSub.subscribe(ACTIVITY_CHANNEL);
    redisSub.on("message", (_channel: string, message: string) => {
      try {
        const pushMsg: ActivityPushMessage = JSON.parse(message);
        const event = pushMsg.data;

        // 分发给该用户的所有本地连接
        const conn = connections.get(event.id ? parseInt(event.id.split('-')[0]) : 0);
        if (conn) {
          conn.callback(event);
        }
      } catch (err) {
        console.error("[ActivityPush] Redis message parse error:", err);
      }
    });
  } catch (err) {
    console.error("[ActivityPush] Redis init error:", err);
  }
}

// ── 订阅活动 ──

export function subscribeToActivity(
  userId: number,
  callback: ActivityPushCallback
): void {
  // 初始化 Redis
  initRedisPubSub().catch(() => {});

  // 存储连接信息
  connections.set(userId, {
    userId,
    callback,
  });
}

// ── 取消订阅 ──

export function unsubscribeFromActivity(userId: number): void {
  connections.delete(userId);
}

// ── 推送活动事件（供其他服务调用）──

export async function pushActivityEvent(
  userId: number,
  event: ActivityEvent
): Promise<void> {
  // 初始化 Redis
  await initRedisPubSub();

  const message: ActivityPushMessage = {
    type: "activity",
    data: event,
  };

  // 本地推送
  const conn = connections.get(userId);
  if (conn) {
    conn.callback(event);
  }

  // Redis Pub/Sub（跨实例）
  if (redisPub) {
    // 在消息中包含 userId 用于路由
    await redisPub.publish(ACTIVITY_CHANNEL, JSON.stringify({
      ...message,
      userId,
    }));
  }
}

// ── 批量推送 ──

export async function pushActivityEvents(
  userId: number,
  events: ActivityEvent[]
): Promise<void> {
  await Promise.all(events.map(event => pushActivityEvent(userId, event)));
}

// ── 获取连接统计 ──

export function getConnectionStats(): { total: number; users: number[] } {
  return {
    total: connections.size,
    users: Array.from(connections.keys()),
  };
}

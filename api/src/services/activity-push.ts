import { redis } from "../lib/redis";

/**
 * 实时活动流服务
 * 对齐 ref-4.5-marketing.md §5
 * 计费完成后 publish 事件到 Redis 频道，管理端 SSE 订阅展示
 */
export const ACTIVITY_CHANNEL = "3cloud:activity:push";

export interface ActivityEvent {
  id: string;
  timestamp: number;
  model: string;
  status: "success" | "error";
  inputTokens: number;
  outputTokens: number;
  cost: number;
  provider: string;
  userId: number | null;
}

export function publishActivity(ev: Omit<ActivityEvent, "id" | "timestamp">): void {
  const event: ActivityEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...ev,
  };
  // 异步发布，失败不阻塞主流程
  redis.publish(ACTIVITY_CHANNEL, JSON.stringify(event)).catch(() => {});
}

/** 获取最近活动（若有缓存；无则返回空——SSE 从订阅起收）*/
export async function getRecentActivity(limit = 50): Promise<ActivityEvent[]> {
  try {
    const raw = await redis.lrange(`${ACTIVITY_CHANNEL}:history`, 0, limit - 1);
    return raw.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

/** 记录一条到 Redis 列表（供 SSE 重连补历史） */
export function pushActivityHistory(ev: ActivityEvent): void {
  redis.lpush(`${ACTIVITY_CHANNEL}:history`, JSON.stringify(ev)).then(() =>
    redis.ltrim(`${ACTIVITY_CHANNEL}:history`, 0, 99),
  ).catch(() => {});
}

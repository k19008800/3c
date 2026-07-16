// ============================================================
//  3cloud (3C) — WebSocket 限流水位推送
//  端点: GET /ws/rate-limits
//  每 5 秒推送当前限流状态（IP/用户/API Key 三个维度的当前水位）
// ============================================================

import { FastifyInstance } from "fastify";
import { getRedis } from "../redis.js";

const WINDOW_SECONDS = 60;
const PUSH_INTERVAL = 5000; // 5 秒

async function getRedisCount(redisKey: string): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_SECONDS * 1000;
  await redis.zremrangebyscore(redisKey, 0, cutoff);
  return redis.zcard(redisKey);
}

async function getRedisTokenSum(redisKey: string): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_SECONDS * 1000;
  const members = await redis.zrange(redisKey, 0, -1, "WITHSCORES");
  await redis.zremrangebyscore(redisKey, 0, cutoff);
  let total = 0;
  for (let i = 1; i < members.length; i += 2) {
    total += parseInt(members[i] ?? "0", 10);
  }
  return total;
}

/** 扫描 Redis 所有匹配 key 并汇总各维度水位 */
async function collectRateLimitWaterLevels(): Promise<{
  global: { rpm: number; tpm: number };
  user: { rpm: number; tpm: number; active: number };
  apiKey: { rpm: number; active: number };
}> {
  const redis = getRedis();

  // 全局水位
  const [globalRpm, globalTpm] = await Promise.all([
    getRedisCount("rl:rpm:global:0"),
    getRedisTokenSum("rl:tpm:global:0"),
  ]);

  // 用户级 RPM key 扫描
  let cursor = "0";
  const userRpmKeys: string[] = [];
  const userTpmKeys: string[] = [];
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "rl:rpm:user:*", "COUNT", "500");
    cursor = next;
    userRpmKeys.push(...keys);
  } while (cursor !== "0");

  cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "rl:tpm:user:*", "COUNT", "500");
    cursor = next;
    userTpmKeys.push(...keys);
  } while (cursor !== "0");

  const [userRpmCounts, userTpmSums] = await Promise.all([
    Promise.all(userRpmKeys.map((k) => getRedisCount(k))),
    Promise.all(userTpmKeys.map((k) => getRedisTokenSum(k))),
  ]);

  const userRpm = userRpmCounts.reduce((a, b) => a + b, 0);
  const userTpm = userTpmSums.reduce((a, b) => a + b, 0);

  const activeUsers = new Set([
    ...userRpmKeys.map((k) => k.replace("rl:rpm:user:", "")),
    ...userTpmKeys.map((k) => k.replace("rl:tpm:user:", "")),
  ]).size;

  // API Key 级 RPM 扫描
  cursor = "0";
  const keyRpmKeys: string[] = [];
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "rl:rpm:key:*", "COUNT", "500");
    cursor = next;
    keyRpmKeys.push(...keys);
  } while (cursor !== "0");

  const keyRpmCounts = await Promise.all(keyRpmKeys.map((k) => getRedisCount(k)));
  const keyRpm = keyRpmCounts.reduce((a, b) => a + b, 0);

  return {
    global: { rpm: globalRpm, tpm: globalTpm },
    user: { rpm: userRpm, tpm: userTpm, active: activeUsers },
    apiKey: { rpm: keyRpm, active: keyRpmKeys.length },
  };
}

export async function rateLimitWsRoutes(app: FastifyInstance) {
  // 注册 @fastify/websocket
  await app.register(import("@fastify/websocket"));

  app.get("/ws/rate-limits", { websocket: true }, (socket, _req) => {
    let closed = false;

    socket.on("close", () => {
      closed = true;
    });

    // 首次立即推送
    (async function push() {
      try {
        const waterLevels = await collectRateLimitWaterLevels();
        if (!closed) {
          socket.send(JSON.stringify({
            type: "rate_limits",
            ts: Date.now(),
            data: waterLevels,
          }));
        }
      } catch (err: any) {
        if (!closed) {
          socket.send(JSON.stringify({
            type: "error",
            message: err?.message ?? "水位采集失败",
          }));
        }
      }
    })();

    // 每 5 秒推送
    const timer = setInterval(async () => {
      if (closed) {
        clearInterval(timer);
        return;
      }

      try {
        const waterLevels = await collectRateLimitWaterLevels();
        if (!closed) {
          socket.send(JSON.stringify({
            type: "rate_limits",
            ts: Date.now(),
            data: waterLevels,
          }));
        }
      } catch (err: any) {
        if (!closed) {
          socket.send(JSON.stringify({
            type: "error",
            message: err?.message ?? "水位采集失败",
          }));
        }
      }
    }, PUSH_INTERVAL);

    socket.on("close", () => {
      clearInterval(timer);
    });
  });
}

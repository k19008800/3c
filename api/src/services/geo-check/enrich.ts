// ============================================================
//  3cloud (3C) — Geo 富化（代理调用日志 / 管理后台展示）
// ============================================================

import { getRedis } from "../../redis.js";
import { lookupGeoWithBlock } from "./block-lookup.js";
import { assessBlockRisk } from "./block-lookup.js";

/**
 * 非阻塞地查询 IP 的地理位置 + 块级风控标记
 * 结果缓存到 Redis (300s)，供 logs 接口和管理后台读取
 * 如果 isAnonymousProxy 为 true，累加用户代理计数器
 */
export async function enrichCallGeo(
  ip: string,
  userId: number,
): Promise<void> {
  try {
    const { geo, block } = await lookupGeoWithBlock(ip);

    const enrichment = {
      city: geo?.city ?? "",
      country: geo?.countryName ?? geo?.country ?? "",
      isProxy: block?.isAnonymousProxy ?? false,
      isAnycast: block?.isAnycast ?? false,
      isSatellite: block?.isSatelliteProvider ?? false,
      accuracyRadius: block?.accuracyRadius ?? null,
    };

    // 缓存到 Redis (仅 5 分钟，用于最近的调用记录展示)
    const redis = getRedis();
    const cacheKey = `geo:enrich:${userId}:${ip}`;
    await redis.setex(cacheKey, 300, JSON.stringify(enrichment));

    // 代理计数（付费 GeoIP2 数据注入后才会有实际作用）
    if (enrichment.isProxy) {
      await redis.incr(`risk:proxy:user:${userId}`);
      await redis.pfadd("risk:proxy:ips", ip);
    }
  } catch {
    // 静默降级 — 不影响主流程
  }
}

/**
 * 从 Redis 读取缓存的调用 geo 富化信息
 */
export async function getCallGeoEnrichment(
  ip: string,
  userId: number,
): Promise<{
  city: string;
  country: string;
  isProxy: boolean;
  isAnycast: boolean;
  isSatellite: boolean;
  accuracyRadius: number | null;
} | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`geo:enrich:${userId}:${ip}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

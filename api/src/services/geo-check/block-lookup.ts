// ============================================================
//  3cloud (3C) — IP 块级数据查询（CSV 导入 ip_geo_blocks 表）
//  补充信息：代理 / Anycast / 卫星网络标记
// ============================================================

import { getRedis } from "../../redis.js";
import { getDb } from "../../db/index.js";
import { sql } from "drizzle-orm";
import { isPrivateIP } from "./geo-lookup.js";
import type { GeoBlockInfo, GeoInfo } from "./types.js";

// ── Redis Key ──

const KEY = {
  blockCache: (ip: string) => `geo:block:${ip}`,
};

/**
 * 查询 IP 在 ip_geo_blocks 表中的块级信息
 * 包括：是否为匿名代理 / Anycast / 卫星上网
 * 使用 GIST 索引做最优匹配 (most specific CIDR)
 */
export async function lookupBlock(ip: string): Promise<GeoBlockInfo | null> {
  if (isPrivateIP(ip)) return null;

  // 查 Redis 缓存 (48h)
  const redis = getRedis();
  const cached = await redis.get(KEY.blockCache(ip));
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }

  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT
        network::text,
        is_anonymous_proxy,
        is_anycast,
        is_satellite_provider,
        accuracy_radius
      FROM ip_geo_blocks
      WHERE network >>= ${ip}::inet
      ORDER BY masklen(network) DESC
      LIMIT 1
    `);

    const row = result.rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const block: GeoBlockInfo = {
      network: String(row.network ?? ""),
      isAnonymousProxy: !!row.is_anonymous_proxy,
      isAnycast: !!row.is_anycast,
      isSatelliteProvider: !!row.is_satellite_provider,
      accuracyRadius: typeof row.accuracy_radius === "number" ? row.accuracy_radius : null,
    };

    // 缓存到 Redis (48h)
    await redis.setex(KEY.blockCache(ip), 172800, JSON.stringify(block));
    return block;
  } catch (err) {
    // ip_geo_blocks 表可能不存在（未迁移），静默降级
    if ((err as Error).message?.includes('relation "ip_geo_blocks" does not exist')) {
      return null;
    }
    console.warn("[GeoIP] ip_geo_blocks 查询失败:", (err as Error).message);
    return null;
  }
}

/**
 * 完整地理信息查询（合并 MMDB + CSV 块数据）
 */
export async function lookupGeoWithBlock(ip: string): Promise<{
  geo: GeoInfo | null;
  block: GeoBlockInfo | null;
}> {
  const [geo, block] = await Promise.all([
    (await import("./geo-lookup.js")).lookupGeo(ip),
    lookupBlock(ip),
  ]);
  return { geo, block };
}

/**
 * 检查 IP 是否有代理/VPN/Anycast 等高风控特征
 * 返回高水位的风险级别
 */
export function assessBlockRisk(
  block: GeoBlockInfo | null,
): { riskLevel: "low" | "medium" | "high"; reasons: string[] } {
  if (!block) return { riskLevel: "low", reasons: [] };

  const reasons: string[] = [];

  if (block.isAnonymousProxy) {
    reasons.push("IP 为匿名代理/VPN");
  }
  if (block.isSatelliteProvider) {
    reasons.push("IP 为卫星网络接入");
  }
  if (block.isAnycast) {
    reasons.push("IP 为任播 (Anycast) 网络");
  }

  if (reasons.length === 0) return { riskLevel: "low", reasons };

  // 代理/VPN → high，其余 → medium
  const hasProxy = block.isAnonymousProxy;
  return {
    riskLevel: hasProxy ? "high" : "medium",
    reasons,
  };
}

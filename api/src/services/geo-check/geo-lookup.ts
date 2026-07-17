// ============================================================
//  3cloud (3C) — GeoIP 地理定位查询
//  依赖：maxmind (npm) + GeoLite2-City.mmdb 数据库
//  数据库文件：api/data/GeoLite2-City.mmdb
// ============================================================

import { getRedis } from "../../redis.js";
import { config } from "../../config.js";
import type { GeoInfo } from "./types.js";

// ── GeoIP 查询 ──

let reader: any = null;

async function getReader(): Promise<any> {
  if (reader) return reader;

  try {
    const { default: maxmind } = await import("maxmind");
    const dbPath = config.geoip?.dbPath ?? "./data/GeoLite2-City.mmdb";
    reader = await maxmind.open(dbPath);
    return reader;
  } catch (err) {
    console.warn("[GeoIP] GeoLite2 数据库加载失败，GeoIP 功能降级:", (err as Error).message);
    return null;
  }
}

// ── 内网 IP 判断 ──

export function isPrivateIP(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip === "unknown" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.20.") ||
    ip.startsWith("172.21.") ||
    ip.startsWith("172.22.") ||
    ip.startsWith("172.23.") ||
    ip.startsWith("172.24.") ||
    ip.startsWith("172.25.") ||
    ip.startsWith("172.26.") ||
    ip.startsWith("172.27.") ||
    ip.startsWith("172.28.") ||
    ip.startsWith("172.29.") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.")
  );
}

// ── Redis Key ──

const KEY = {
  geoCache: (ip: string) => `geo:${ip}`,
};

/**
 * 查询 IP 地理信息
 * 使用 Redis 缓存结果 24h 减少数据库读取
 */
export async function lookupGeo(ip: string): Promise<GeoInfo | null> {
  // 内网/本地 IP 直接返回 null
  if (isPrivateIP(ip)) return null;

  // 查 Redis 缓存
  const redis = getRedis();
  const cached = await redis.get(KEY.geoCache(ip));
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }

  const r = await getReader();
  if (!r) return null;

  try {
    const result = r.get(ip);
    if (!result) return null;

    const geo: GeoInfo = {
      country: result.country?.iso_code ?? "",
      countryName: result.country?.names?.zh ?? result.country?.names?.en ?? "",
      city: result.city?.names?.zh ?? result.city?.names?.en ?? "",
      latitude: result.location?.latitude ?? 0,
      longitude: result.location?.longitude ?? 0,
    };

    // 缓存到 Redis (24h)
    await redis.setex(KEY.geoCache(ip), 86400, JSON.stringify(geo));
    return geo;
  } catch {
    return null;
  }
}

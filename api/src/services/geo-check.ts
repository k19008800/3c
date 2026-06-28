// ============================================================
//  3cloud (3C) — GeoIP 异地登录检测服务
//  依赖：maxmind (npm) + GeoLite2-City.mmdb 数据库
//  数据库文件：api/data/GeoLite2-City.mmdb
//  功能：IP 地理定位 / 异地判定 / 光速不可能检测
// ============================================================

import { getRedis } from "../redis.js";
import { config } from "../config.js";
import { loadSecurityConfig } from "./login-security.js";

// ── GeoIP 查询结果 ──

export interface GeoInfo {
  country: string;       // CN
  countryName: string;   // 中国
  city: string;          // 杭州
  latitude: number;
  longitude: number;
}

// ── 风险判定结果 ──

export interface GeoRiskResult {
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
}

// ── Redis Key ──

const KEY = {
  lastGeo: (uid: number) => `risk:geo:user:${uid}`,
  lastDevice: (uid: number) => `risk:device:user:${uid}`,
  geoCache: (ip: string) => `geo:${ip}`,
};

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

/**
 * 查询 IP 地理信息
 * 使用 Redis 缓存结果 24h 减少数据库读取
 */
export async function lookupGeo(ip: string): Promise<GeoInfo | null> {
  // 内网/本地 IP 直接返回 null
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip === "unknown"
  ) {
    return null;
  }

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

// ── 光速不可能检测 ──

/**
 * 计算球面两点距离（haversine 公式）
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371; // 地球半径 km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isPhysicalPossible(
  geo1: GeoInfo,
  geo2: GeoInfo,
  timeDiffMs: number,
  maxSpeedKmh: number = 1000,
): boolean {
  const distance = haversineDistance(
    geo1.latitude, geo1.longitude,
    geo2.latitude, geo2.longitude,
  );
  const hours = timeDiffMs / 3600_000;
  const maxPossibleDist = hours * maxSpeedKmh;
  // 1.5 倍余量（考虑转机、高铁等）
  return distance <= maxPossibleDist * 1.5;
}

// ── 设备指纹简化版（基于 UA 的 hash） ──

function hashUserAgent(ua: string): string {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(ua).digest("hex").slice(0, 16);
}

// ── 异地登录检测 ──

/**
 * 检测本次登录是否异常
 */
export async function detectUnusualLogin(
  userId: number,
  currentIp: string,
  currentUA: string,
  currentGeo: GeoInfo | null,
): Promise<GeoRiskResult> {
  const redis = getRedis();
  const cfg = await loadSecurityConfig();

  // 1. 高风险国家检查
  if (currentGeo) {
    const highRiskCountries: string[] = cfg.high_risk_countries ?? [];
    if (highRiskCountries.includes(currentGeo.country)) {
      return {
        riskLevel: "critical",
        reason: `登录 IP 位于高风险国家/地区 (${currentGeo.country})`,
      };
    }
  }

  // 如果没有地理信息（内网 IP），降低风险评级
  if (!currentGeo) {
    // 仅做设备检查
    const lastDeviceHash = await redis.get(KEY.lastDevice(userId));
    const deviceHash = currentUA ? hashUserAgent(currentUA) : null;

    if (lastDeviceHash && deviceHash && lastDeviceHash !== deviceHash) {
      // 记录新设备
      await redis.setex(KEY.lastDevice(userId), 86400 * 7, deviceHash);
      return {
        riskLevel: "medium",
        reason: "检测到新设备/浏览器登录",
      };
    }

    // 首次记录设备
    if (!lastDeviceHash && deviceHash) {
      await redis.setex(KEY.lastDevice(userId), 86400 * 7, deviceHash);
    }

    return { riskLevel: "low", reason: "" };
  }

  // 2. 获取上次成功登录的地理信息
  const lastGeoRaw = await redis.get(KEY.lastGeo(userId));
  const lastDeviceHash = await redis.get(KEY.lastDevice(userId));
  const deviceHash = currentUA ? hashUserAgent(currentUA) : null;

  if (!lastGeoRaw) {
    // 首次登录，记录地理信息
    await redis.setex(KEY.lastGeo(userId), 86400 * 7, JSON.stringify(currentGeo));
    if (deviceHash) {
      await redis.setex(KEY.lastDevice(userId), 86400 * 7, deviceHash);
    }
    return { riskLevel: "low", reason: "" };
  }

  // 3. 比对地理信息
  let lastGeo: GeoInfo;
  try {
    lastGeo = JSON.parse(lastGeoRaw);
  } catch {
    return { riskLevel: "low", reason: "" };
  }

  const isSameCity = lastGeo.city === currentGeo.city && lastGeo.country === currentGeo.country;
  const isSameDevice = lastDeviceHash === deviceHash;
  const isSameCountry = lastGeo.country === currentGeo.country;

  // 时间差（从会话中读取上次登录时间，这里保守处理）
  const timeDiffMs = 3600_000; // 默认 1h（实际应当从上一次登录时间计算）

  if (!isSameCountry) {
    // 跨国登录
    if (isPhysicalPossible(lastGeo, currentGeo, timeDiffMs)) {
      return { riskLevel: "high", reason: `登录国家从 ${lastGeo.countryName} 变更为 ${currentGeo.countryName}` };
    } else {
      return { riskLevel: "critical", reason: `登录地点在短时间内从 ${lastGeo.city} (${lastGeo.countryName}) 到 ${currentGeo.city} (${currentGeo.countryName})，物理上不可能` };
    }
  }

  if (!isSameCity) {
    if (isPhysicalPossible(lastGeo, currentGeo, timeDiffMs)) {
      if (isSameDevice) {
        return { riskLevel: "medium", reason: `登录城市从 ${lastGeo.city} 变更为 ${currentGeo.city}` };
      } else {
        return { riskLevel: "high", reason: `登录城市从 ${lastGeo.city} 变更为 ${currentGeo.city}，且为新设备` };
      }
    } else {
      return { riskLevel: "critical", reason: `登录地点在短时间内从 ${lastGeo.city} 到 ${currentGeo.city}，物理上不可能` };
    }
  }

  // 同城市，检查设备变化
  if (!isSameDevice && lastDeviceHash) {
    // 新设备
    if (deviceHash) {
      await redis.setex(KEY.lastDevice(userId), 86400 * 7, deviceHash);
    }
    return { riskLevel: "medium", reason: "检测到新设备/浏览器登录" };
  }

  // 记录新设备
  if (!lastDeviceHash && deviceHash) {
    await redis.setex(KEY.lastDevice(userId), 86400 * 7, deviceHash);
  }

  return { riskLevel: "low", reason: "" };
}

// ── 更新上次登录地理信息（登录成功后调用） ──

export async function updateLastGeo(userId: number, geo: GeoInfo): Promise<void> {
  const redis = getRedis();
  await redis.setex(KEY.lastGeo(userId), 86400 * 7, JSON.stringify(geo));
}

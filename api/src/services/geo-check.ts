// ============================================================
//  3cloud (3C) — GeoIP 异地登录检测服务
//  依赖：maxmind (npm) + GeoLite2-City.mmdb 数据库
//  数据库文件：api/data/GeoLite2-City.mmdb
//  补充：ip_geo_blocks 表（CSV 导入，代理/Anycast 标记）
//  功能：IP 地理定位 / 异地判定 / 光速不可能检测 / 代理风控
// ============================================================

import { getRedis } from "../redis.js";
import { config } from "../config.js";
import { loadSecurityConfig } from "./login-security.js";
import { createHash } from "node:crypto";
import { getDb } from "../db/index.js";
import { sql } from "drizzle-orm";

// ── GeoIP 查询结果 ──

export interface GeoInfo {
  country: string;       // CN
  countryName: string;   // 中国
  city: string;          // 杭州
  latitude: number;
  longitude: number;
}

// ── CSV 块级数据（来自 ip_geo_blocks 表） ──

export interface GeoBlockInfo {
  network: string;
  isAnonymousProxy: boolean;
  isAnycast: boolean;
  isSatelliteProvider: boolean;
  accuracyRadius: number | null;
}

// ── 风险判定结果（增强版） ──

export interface GeoRiskResult {
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
  /** 是否触发代理/VPN 检测 */
  proxyDetected?: boolean;
}

// ── Redis Key ──

const KEY = {
  lastGeo: (uid: number) => `risk:geo:user:${uid}`,
  lastDevice: (uid: number) => `risk:device:user:${uid}`,
  geoCache: (ip: string) => `geo:${ip}`,
  blockCache: (ip: string) => `geo:block:${ip}`,
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

// ── 内网 IP 判断 ──

function isPrivateIP(ip: string): boolean {
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

// ═══════════════════════════════════════════════
//  块数据查询（来自 CSV 导入的 ip_geo_blocks 表）
// ═══════════════════════════════════════════════

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
    lookupGeo(ip),
    lookupBlock(ip),
  ]);
  return { geo, block };
}

// ── 调用 Geo 富化（用于代理调用日志 / 管理后台展示） ──

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

// ── 块级数据风控检查 ──

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
  return createHash("sha256").update(ua).digest("hex").slice(0, 16);
}

// ═══════════════════════════════════════════════
//  异地 + 代理 综合风险检测
// ═══════════════════════════════════════════════

/**
 * 检测本次登录是否异常（增强版）
 * - 考虑块数据中的代理/VPN/Anycast 信号
 * - 高风险代理直接提升风控等级
 */
export async function detectUnusualLogin(
  userId: number,
  currentIp: string,
  currentUA: string,
  currentGeo: GeoInfo | null,
): Promise<GeoRiskResult> {
  const redis = getRedis();
  const cfg = await loadSecurityConfig();

  // 0a. 块级风控——代理/VPN/Anycast 检测（独立于地理信息）
  const block = await lookupBlock(currentIp);
  const blockRisk = assessBlockRisk(block);

  // 高风险代理 → 直接返回 critical
  if (blockRisk.riskLevel === "high") {
    return {
      riskLevel: "critical",
      reason: `检测到高风险网络特征: ${blockRisk.reasons.join("；")}`,
      proxyDetected: true,
    };
  }

  // 0b. 高风险国家检查
  if (currentGeo) {
    const highRiskCountries: string[] = cfg.high_risk_countries ?? [];
    if (highRiskCountries.includes(currentGeo.country)) {
      return {
        riskLevel: "critical",
        reason: `登录 IP 位于高风险国家/地区 (${currentGeo.country})`,
        proxyDetected: blockRisk.riskLevel === "medium",
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

    // 首次登录但有 Anycast/卫星 → 适当提示
    if (blockRisk.riskLevel === "medium") {
      return {
        riskLevel: "medium",
        reason: `首次登录，检测到网络特征: ${blockRisk.reasons.join("；")}`,
        proxyDetected: false,
      };
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
    // 跨国登录 + 非地理风险叠加
    const risk = isPhysicalPossible(lastGeo, currentGeo, timeDiffMs) ? "high" : "critical";
    const reason = risk === "critical"
      ? `登录地点在短时间内从 ${lastGeo.city} (${lastGeo.countryName}) 到 ${currentGeo.city} (${currentGeo.countryName})，物理上不可能`
      : `登录国家从 ${lastGeo.countryName} 变更为 ${currentGeo.countryName}`;
    return { riskLevel: risk, reason, proxyDetected: blockRisk.riskLevel === "medium" };
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
    return { riskLevel: hostDeviceChangedRisk(blockRisk.riskLevel), reason: `检测到新设备/浏览器登录${blockRisk.riskLevel !== "low" ? "，" + blockRisk.reasons.join("；") : ""}` };
  }

  // 记录新设备
  if (!lastDeviceHash && deviceHash) {
    await redis.setex(KEY.lastDevice(userId), 86400 * 7, deviceHash);
  }

  return { riskLevel: "low", reason: "" };
}

/**
 * 设备变更 + 网络异常信号 → 风险等级叠加
 */
function hostDeviceChangedRisk(blockRiskLevel: "low" | "medium" | "high"): "low" | "medium" | "high" {
  if (blockRiskLevel === "high") return "high";
  return "medium";
}

// ── 更新上次登录地理信息（登录成功后调用） ──

export async function updateLastGeo(userId: number, geo: GeoInfo): Promise<void> {
  const redis = getRedis();
  await redis.setex(KEY.lastGeo(userId), 86400 * 7, JSON.stringify(geo));
}

// ============================================================
//  3cloud (3C) — 异地 + 代理 综合风险检测
// ============================================================

import { getRedis } from "../../redis.js";
import { createHash } from "node:crypto";
import { loadSecurityConfig } from "../login-security.js";
import { lookupBlock } from "./block-lookup.js";
import { assessBlockRisk } from "./block-lookup.js";
import { lookupGeo } from "./geo-lookup.js";
import type { GeoInfo, GeoRiskResult } from "./types.js";

// ── Redis Key ──

export const KEY = {
  lastGeo: (uid: number) => `risk:geo:user:${uid}`,
  lastDevice: (uid: number) => `risk:device:user:${uid}`,
  geoCache: (ip: string) => `geo:${ip}`,
  blockCache: (ip: string) => `geo:block:${ip}`,
};

// ── 设备指纹简化版（基于 UA 的 hash） ──

function hashUserAgent(ua: string): string {
  return createHash("sha256").update(ua).digest("hex").slice(0, 16);
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

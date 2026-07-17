// ============================================================
//  3cloud (3C) — GeoIP 类型定义
// ============================================================

export interface GeoInfo {
  country: string;       // CN
  countryName: string;   // 中国
  city: string;          // 杭州
  latitude: number;
  longitude: number;
}

export interface GeoBlockInfo {
  network: string;
  isAnonymousProxy: boolean;
  isAnycast: boolean;
  isSatelliteProvider: boolean;
  accuracyRadius: number | null;
}

export interface GeoRiskResult {
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
  /** 是否触发代理/VPN 检测 */
  proxyDetected?: boolean;
}

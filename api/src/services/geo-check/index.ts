// ============================================================
//  3cloud (3C) — GeoIP 异地登录检测服务
// ============================================================

export type { GeoInfo, GeoBlockInfo, GeoRiskResult } from "./types.js";
export { lookupGeo } from "./geo-lookup.js";
export { lookupBlock, lookupGeoWithBlock, assessBlockRisk } from "./block-lookup.js";
export { enrichCallGeo, getCallGeoEnrichment } from "./enrich.js";
export { isPhysicalPossible, detectUnusualLogin, updateLastGeo } from "./detect.js";

// ============================================================
//  3cloud (3C) — 通道熔断器 V2 常量
// ============================================================

export const DEFAULT_OPEN_MS = 30000;      // Level 2 半开窗口（30秒）
export const DEFAULT_HALF_OPEN_MS = 120000; // 半开探测窗口（2分钟）
export const DEFAULT_TRIP_THRESHOLD = 3;    // 简化兼容：原有熔断阈值
export const LEVEL1_FAIL_THRESHOLD = 5;     // 软降级阈值
export const LEVEL2_FAIL_THRESHOLD = 10;    // 半开阈值
export const LEVEL3_PROBE_FAIL_LIMIT = 3;   // 永久关停阈值（半开探测失败次数）
export const WEIGHT_REDUCED = 10;           // 软降级后的权重

// ── Redis Key 前缀 ──

export const KEY = {
  failures: (vmId: number) => `cb:v2:fail:${vmId}`,
  open: (vmId: number) => `cb:v2:open:${vmId}`,
  halfOpen: (vmId: number) => `cb:v2:half:${vmId}`,
  weightReduced: (vmId: number) => `cb:v2:degraded:${vmId}`,
  level3ProbeFails: (vmId: number) => `cb:v2:dead:probes:${vmId}`,
};

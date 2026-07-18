// ============================================================
//  3cloud (3C) — 通道熔断器 V2
//  状态机: CLOSED → Level1(软降级) → Level2(半开) → Level3(永久)
//  Redis + DB 双持久化
// ============================================================
//
//  阈值配置：
//   Level 1（软降级）: 连续失败 5 次 → weight 降为 10%
//   Level 2（半开）  : 连续失败 10 次 → isDown=true, circuit_state='half_open'
//   Level 3（永久）  : 半开状态 3 次探测全失败 → circuit_state='dead'
//   探测成功 1 次    : 恢复 weight, isDown=false, circuit_state='closed'
//
//  全部打开时间可配置，默认值通过 config 或安全配置读取。
// ============================================================

export * from "./circuit-breaker/index.js";

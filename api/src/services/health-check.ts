// ============================================================
//  3cloud (3C) — 厂商健康检查
//  被动检查（主要）+ 主动检查（辅助）
//  占位 — 后续开发实现
// ============================================================

/**
 * 被动健康检测：每次调用后更新
 * - 近 50 次采样
 * - < 70% → degraded（权重降至 50%）
 * - < 30% → down（权重归零）
 */
export async function updateHealthAfterCall(
  vendorModelId: number,
  success: boolean,
  durationMs: number
) {
  // TODO: 更新 vendor_models.healthScore / isDown
}

/**
 * 主动健康检测：每 5 分钟对 down 厂商发轻量请求
 * 连续成功 3 次 → 恢复 active
 */
export async function activeHealthCheck() {
  // TODO: 对 isDown=true 的厂商发 GET /v1/models 轻量请求
  // 连续成功 3 次 → 恢复 active
}

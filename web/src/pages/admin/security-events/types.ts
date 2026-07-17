// ── 事件类型标签 ──
export const eventTypeLabels: Record<string, string> = {
  brute_force: '暴力破解',
  unusual_location: '异地登录',
  new_device: '新设备',
  ip_banned: 'IP封禁',
  user_banned: '账号封禁',
  user_captcha: '验证码挑战',
  circuit_trip: '厂商熔断',
  circuit_recovery: '熔断恢复',
  vendor_failure: '厂商失败',
}

// ── 风险等级排序（严重 → 低） ──
export const RISK_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

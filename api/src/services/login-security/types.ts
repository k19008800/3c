// ============================================================
//  3cloud (3C) — 登录风控服务 类型定义
// ============================================================

export interface SecurityConfigMap {
  maxIpFailPerMin: number;
  ipBanMinutes: number;
  maxUserFailPerMin: number;
  userCaptchaAfter: number;
  userBanMinutes: number;
  maxUserFail24h: number;
  [key: string]: any;
}

export interface PreLoginCheckResult {
  allowed: boolean;
  retryAfterMs?: number;
  requireCaptcha?: boolean;
  captchaSession?: string;
  blockedReason?: string;
}

// ============================================================
//  3cloud (3C) — 兑换码风控引擎 常量 & 权重
// ============================================================

export const KEY_PREFIX = "fraud";

export function bruteForceIpKey(ip: string): string {
  return `${KEY_PREFIX}:brute:ip:${ip}`;
}

export function bruteBlockedIpKey(ip: string): string {
  return `${KEY_PREFIX}:brute:blocked:${ip}`;
}

export function userFreqKey(userId: number): string {
  return `${KEY_PREFIX}:user:freq:${userId}`;
}

export function codeAttemptKey(codeId: number): string {
  return `${KEY_PREFIX}:code:attempt:${codeId}`;
}

export const BANNED_IPS_SET = `${KEY_PREFIX}:banned:ips`;

export const WEIGHT_BRUTE_FORCE = 0.4;
export const WEIGHT_USER_FREQ = 0.3;
export const WEIGHT_NEW_USER = 0.2;
export const WEIGHT_CODE_ATTEMPT = 0.1;

export const BRUTE_FORCE_THRESHOLD = 20;
export const BRUTE_FORCE_MAX = 100;
export const USER_FREQ_WARN = 10;
export const USER_FREQ_MAX = 50;
export const CODE_LEAK_THRESHOLD = 3;
export const CODE_ATTEMPT_MAX = 20;

// ============================================================
//  3cloud (3C) — 兑换码系统 常量/类型/工具函数
// ============================================================

import { randomBytes } from "node:crypto";

// ── 工具：生成 16 位随机码（数字 + 大写字母）──

export function generateRedemptionCode(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆 I/O/0/1
  const bytes = randomBytes(16);
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += charset[bytes[i] % charset.length];
  }
  return code;
}

export function generateCodes(count: number): Set<string> {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateRedemptionCode());
  }
  return codes;
}

// ── 工具：解析用户角色（是否为代理商或管理员）──

export function isAdminRole(role: string): boolean {
  return ["super_admin", "admin", "finance_ops", "ops"].includes(role);
}

// ── 限流 Key ──

export function redeemRateLimitKey(ip: string): string {
  return `rate:redeem:ip:${ip}`;
}

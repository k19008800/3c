// ============================================================
//  3cloud (3C) — 活动管理路由共享类型与工具函数
// ============================================================

import { randomBytes } from "node:crypto";

// ── 工具：判断是否为管理员角色 ──

export function isAdminRole(role: string): boolean {
  return ["super_admin", "admin"].includes(role);
}

// ── 工具：生成 16 位随机兑换码 ──

function generateRedemptionCode(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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

// ── 限制的 status 转换规则 ──

export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft:  ["active"],
  active: ["ended"],
  ended:  ["archived"],
  archived: [],
};

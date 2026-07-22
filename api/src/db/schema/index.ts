// ═══════════════════════════════════════════════════════════════════
//  3cloud (3C) — DB Schema Barrel Export
//  自动生成 — 保持此文件与各 schema 文件同步
// ═══════════════════════════════════════════════════════════════════

// ── 核心表 ──
export * from "./users.js";
export * from "./vendors.js";
export * from "./billing.js";
export * from "./agents.js";

// ── 兑换码系统 ──
export * from "./redemption.js";
export * from "./campaigns.js";
export * from "./code-templates.js";

// ── 财务 ──
export * from "./finance.js";

// ── 系统 ──
export * from "./system.js";

// ── 角色权限 ──
export * from "./roles.js";

// ── 安全 ──
export * from "./security.js";

// ── 提示词审计 ──
export * from "./prompt-audit.js";

// ── 通知 ──
export * from "./notification.js";

// ── 额度 ──
export * from "./quotas.js";

// ── 管理后台 ──
export * from "./admin.js";

// ── API 密钥 ──
export * from "./api-keys.js";

// ── 枚举 ──
export * from "./enums.js";

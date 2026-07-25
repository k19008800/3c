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

// ── API Key 权限模板（已在 api-keys.js 中定义）──
// apiKeyPermissionTemplates 已在 api-keys.js 中导出

// ── 枚举 ──
export * from "./enums.js";

// ── 配置版本控制 ──
export * from "./config-versions.js";

// ── 监控告警 ──
export * from "./monitoring.js";

// ── 通知订阅与偏好 ──
export * from "./notification-subscriptions.js";

// ── 提示词模板 ──
export * from "./prompt-templates.js";

// ── 异常操作告警 ──
export * from "./operation-alert.js";

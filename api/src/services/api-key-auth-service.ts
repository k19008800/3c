// ============================================================
//  3cloud (3C) — API Key 权限验证服务
//  已拆分到 api-key-auth/ 目录
// ============================================================

export type { ApiKeyAuthResult } from "./api-key-auth/types.js";
export { ApiKeyAuthService } from "./api-key-auth/validate.service.js";
export { updateUsageStats, resetUsageStatsIfNeeded } from "./api-key-auth/usage.service.js";

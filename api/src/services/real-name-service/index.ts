// ============================================================
//  3cloud (3C) — 实名认证服务
// ============================================================

export type { FileUploadResult, AutoVerifyResult } from "./types.js";
export { validateIdNumber } from "./id-validator.js";
export { invalidateConfigCache } from "./system-config.js";
export { getFileAbsolutePath, toRelativePath, saveUploadedFile, removeUserVersionFiles, getMimeType } from "./file-manager.js";
export { checkSubmitRateLimit, markSubmitRateLimit } from "./rate-limit.js";
export { autoVerifyRealName, autoApproveRealName } from "./auto-verify.js";

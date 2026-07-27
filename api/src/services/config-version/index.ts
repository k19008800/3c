// ============================================================
//  3cloud (3C) — 增强版配置版本控制 barrel
// ============================================================

export type { ConfigType } from "./types.js";
export { recordConfigChange, recordEnhancedConfigChange } from "./record.js";
export { batchRecordConfigChanges } from "./batch.js";
// NOTE: configSnapshots/configChangeRequests 表尚未添加到 schema（TODO），临时注释以避免启动崩溃
// export { createConfigSnapshot, restoreConfigSnapshot } from "./snapshot.js";
// export { getConfigSnapshots } from "./snapshot-list.js";
// export { createConfigChangeRequest, processConfigChangeRequest } from "./change-request.js";
export { evaluateConfigChangeImpact, getConfigDependencies } from "./impact.js";
export { getConfigHistory, getConfigVersion } from "./history.js";
export { diffConfigs } from "./diff.js";

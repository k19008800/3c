// ============================================================
//  3cloud (3C) — 配置版本控制服务（向后兼容层）
// ============================================================

export type { ConfigType } from "./config-version/index.js";
export { recordConfigChange } from "./config-version/index.js";
export { getConfigHistory } from "./config-version/index.js";
export { getConfigVersion } from "./config-version/index.js";
export { diffConfigs } from "./config-version/index.js";
// 注意：为了向后兼容，此文件重新导出拆分后的函数
// 新代码请直接导入 from "./config-version/index.js"

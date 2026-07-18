// ============================================================
//  路由引擎 — 重导出入口（兼容旧导入路径）
// ============================================================
//  代码已拆分到 services/router/ 目录
//  本文件保留仅为了兼容现有导入路径，不再包含业务逻辑

export type {
  RoutingStrategy,
  RoutingOptions,
  VendorModelRoute,
  ForwardResult,
  StreamForwardResult,
} from "./router/types.js";

export { selectRoute } from "./router/route-selection.js";
export { clearModelNameCache } from "./router/model-cache.js";
export { selectKeyFromGroup } from "./router/key-group.js";
export { forwardRequest, forwardStreamRequest } from "./router/forward.js";

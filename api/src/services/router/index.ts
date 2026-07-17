// ============================================================
//  路由引擎 — 统一导出入口
// ============================================================
//  re-exports all public symbols from the original router.ts

export type {
  RoutingStrategy,
  RoutingOptions,
  VendorModelRoute,
  ForwardResult,
  StreamForwardResult,
} from "./types.js";

export { selectRoute } from "./route-selection.js";
export { clearModelNameCache } from "./model-cache.js";
export { selectKeyFromGroup } from "./key-group.js";
export { forwardRequest, forwardStreamRequest } from "./forward.js";

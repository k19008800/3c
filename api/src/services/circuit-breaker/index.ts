// ============================================================
//  3cloud (3C) — 通道熔断器 V2
// ============================================================

export type { CircuitStateV2, CircuitStatusV2 } from "./types.js";

export {
  shouldSkipVendor,
  recordVendorModelFailure,
  recordVendorModelSuccess,
  getAdjustedWeight,
} from "./operations.js";

export {
  getAllCircuitStatuses,
  getCircuitHistory,
  getCircuitDetail,
  getActiveCircuitCount,
  resetCircuit,
} from "./queries.js";

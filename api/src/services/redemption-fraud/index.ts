// ============================================================
//  3cloud (3C) — 兑换码风控引擎 (Barrel)
// ============================================================

export type { RedeemFraudResult } from "./types.js";
export { checkRedeemFraud, recordBruteForce, recordCodeLeak, recordUserFrequency, calculateRiskScore } from "./checker.js";
export { banIp, unbanIp, isIpBanned } from "./ban-manager.js";

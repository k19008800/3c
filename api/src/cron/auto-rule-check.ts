// ============================================================
//  3cloud (3C) — 安全自动规则定时检查
//  每 60 秒执行一次 checkAndExecuteRules()
// ============================================================

import { runAutoRuleCheck } from "../services/security-auto-rule-engine.js";

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function scheduleAutoRuleCheck(): void {
  // 首次延迟 15 秒启动（确保服务完全就绪），之后每 60 秒执行
  setTimeout(() => {
    runAutoRuleCheck().catch(() => {});

    intervalHandle = setInterval(() => {
      runAutoRuleCheck().catch(() => {});
    }, 60 * 1000);

    console.log("[AutoRuleCheck] Scheduled: every 60 seconds");
  }, 15_000);
}

export function stopAutoRuleCheck(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[AutoRuleCheck] Stopped");
  }
}

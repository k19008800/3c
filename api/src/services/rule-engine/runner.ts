// ============================================================
//  3cloud (3C) — 安全自动规则引擎 — 便捷入口（CRON调用）
// ============================================================

import { logger } from "../../logger.js";
import { checkAndExecuteRules } from "./engine.js";

export async function runAutoRuleCheck(): Promise<void> {
  try {
    const result = await checkAndExecuteRules();
    if (result.executed > 0) {
      logger.info({ executed: result.executed, total: result.details.length }, "[AutoRule] 自动规则检查完成");
    }
  } catch (err) {
    logger.error({ err }, "[AutoRule] 自动规则检查异常");
  }
}

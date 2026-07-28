// ============================================================
//  3cloud (3C) — 结算自动确认 Cron
//  每天 03:00 执行过期待确认结算单
// ============================================================

import cron from "node-cron";
import { autoConfirmOverdueSettlements } from "../services/settlement-cycle.js";

export function scheduleAutoConfirmSettlements() {
  cron.schedule("0 3 * * *", async () => {
    try {
      const count = await autoConfirmOverdueSettlements();
      if (count > 0) {
        console.log(`[SettlementCron] Auto-confirmed ${count} overdue settlements`);
      }
    } catch (err) {
      console.error("[SettlementCron] Error:", err);
    }
  });

  console.log("[SettlementCron] Scheduled: daily at 03:00");
}

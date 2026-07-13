// ============================================================
//  3cloud (3C) — 自动结算 Cron
//  每天 02:00 + 14:00 执行
// ============================================================

import cron from "node-cron";
import { autoSettleDueAgents } from "../services/agent-settlement.js";

export function scheduleAutoSettle() {
  // 每天 02:00
  cron.schedule("0 2 * * *", async () => {
    try {
      console.log("[AutoSettle] Starting daily settlement...");
      const count = await autoSettleDueAgents();
      console.log(`[AutoSettle] Settled ${count} agents`);
    } catch (err) {
      console.error("[AutoSettle] Error:", err);
    }
  });

  // 每天 14:00（第二次机会）
  cron.schedule("0 14 * * *", async () => {
    try {
      const count = await autoSettleDueAgents();
      console.log(`[AutoSettle] Afternoon run: ${count} agents settled`);
    } catch (err) {
      console.error("[AutoSettle] Afternoon error:", err);
    }
  });

  console.log("[AutoSettle] Cron scheduled: 02:00 and 14:00 daily");
}

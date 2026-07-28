// ============================================================
//  3cloud (3C) — 注销冷却到期自动执行
//  每小时检查一次，执行到期注销
// ============================================================

import cron from "node-cron";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

export function scheduleDeletionAutoComplete() {
  // 每小时一次
  cron.schedule("0 * * * *", async () => {
    try {
      const db = getDb();

      // 冷却期到期的注销请求
      const expiredResult = await db.execute(
        sql`SELECT id, user_id FROM account_deletion_requests
            WHERE status = 'cooling'
            AND cooling_deadline <= NOW()
            AND cooling_deadline IS NOT NULL`
      );

      if (expiredResult.rows.length === 0) return;

      let processed = 0;
      for (const row of expiredResult.rows) {
        const { id: requestId, user_id: userId } = row as any;

        await db.execute(
          sql`UPDATE users SET
            status = 'deleted',
            nickname = CONCAT('已注销用户_', id),
            email = CONCAT('deleted_', id, '@internal.3cloud.ai'),
            phone = NULL,
            avatar_url = NULL,
            updated_at = NOW()
          WHERE id = ${userId}`
        );

        await db.execute(
          sql`UPDATE account_deletion_requests SET
            status = 'completed',
            completed_at = NOW(),
            updated_at = NOW()
          WHERE id = ${requestId}`
        );

        processed++;
      }

      console.log(`[DeletionCron] Auto-completed ${processed} deletions for expired cooling periods`);
    } catch (err) {
      console.error("[DeletionCron] Error:", err);
    }
  });

  console.log("[DeletionCron] Scheduled: every hour");
}

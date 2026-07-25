// ============================================================
//  3cloud (3C) — 定时公告发布任务
//  每分钟检查并发布到期的定时公告，支持限流重试
// ============================================================

import { getDb } from "../db/index.js";
import { announcements } from "../db/schema.js";
import { lte, eq, and } from "drizzle-orm";

const MAX_RETRIES = 3;

/**
 * 执行定时公告发布检查：
 * 1. 查询所有 scheduled_at <= now 且 published = false 的公告
 * 2. 更新 published = true, status = 'published'
 * 3. 失败时自动重试（最多 3 次）
 */
export async function runPublishScheduledAnnouncements(): Promise<number> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const db = getDb();
      const now = new Date();

      const result = await db
        .update(announcements)
        .set({
          published: true,
          status: 'published' as any,
        })
        .where(
          and(
            lte(announcements.scheduledAt, now),
            eq(announcements.published, false)
          )
        )
        .returning({ id: announcements.id, title: announcements.title });

      if (result.length > 0) {
        for (const a of result) {
          console.log(`[Cron] Published scheduled announcement #${a.id}: ${a.title}`);
        }
        console.log(`[Cron] Announcement publish done: ${result.length} published`);
      }

      return result.length;
    } catch (err) {
      console.error(`[Cron] Announcement publish error (attempt ${attempt}/${MAX_RETRIES}):`, err);
      if (attempt === MAX_RETRIES) {
        console.error(`[Cron] All ${MAX_RETRIES} retries exhausted for announcement publish`);
        return 0;
      }
      // 指数退避: 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }
  return 0;
}

/**
 * 调度定时任务（每分钟执行）
 */
export function schedulePublishScheduledAnnouncements() {
  const cron = require("node-cron");

  cron.schedule("* * * * *", async () => {
    await runPublishScheduledAnnouncements();
  });

  console.log("[Cron] Scheduled announcement publish scheduled: every minute");
}

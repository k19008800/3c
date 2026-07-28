// ============================================================
//  3cloud (3C) — 公告定时发布任务
//  每分钟检查并发布到期的定时公告
// ============================================================

import { getDb } from "../db/index.js";
import { announcements, userNotifications, users } from "../db/schema.js";
import { lte, eq, and, sql } from "drizzle-orm";

/**
 * 执行公告定时发布检查：
 *  1. 查询所有 scheduledAt <= now 且 isPublished = false 的公告
 *  2. 将 isPublished 设置为 true
 *  3. 广播站内信通知到所有活跃用户
 */
export async function runPublishAnnouncements(): Promise<{ published: number; notified: number }> {
  try {
    const db = getDb();
    const now = new Date();

    // 1. 查找到期的待发布公告
    const dueAnnouncements = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
      })
      .from(announcements)
      .where(
        and(
          eq(announcements.isPublished, false),
          eq(announcements.status, true), // 必须是启用状态
          lte(announcements.scheduledAt, now),
          sql`${announcements.scheduledAt} IS NOT NULL`
        )
      );

    if (dueAnnouncements.length === 0) {
      return { published: 0, notified: 0 };
    }

    let totalNotified = 0;

    // 2. 逐个发布并广播通知
    for (const announcement of dueAnnouncements) {
      // 更新为已发布
      await db
        .update(announcements)
        .set({ isPublished: true, updatedAt: now })
        .where(eq(announcements.id, announcement.id));

      // 广播站内信
      const notified = await broadcastAnnouncement(announcement.title, announcement.content);
      totalNotified += notified;

      console.log(`[Cron] Published scheduled announcement #${announcement.id}: ${announcement.title}, notified ${notified} users`);
    }

    console.log(`[Cron] Announcement publish check completed: ${dueAnnouncements.length} published, ${totalNotified} users notified`);
    return { published: dueAnnouncements.length, notified: totalNotified };
  } catch (err) {
    console.error("[Cron] Announcement publish check error:", err);
    return { published: 0, notified: 0 };
  }
}

/**
 * 广播公告到所有活跃用户的站内信
 */
async function broadcastAnnouncement(title: string, content: string): Promise<number> {
  const db = getDb();

  // 查询所有活跃用户
  const allUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.status, "active"));

  if (allUsers.length === 0) {
    return 0;
  }

  // 分批插入通知（每批 500 条）
  const CHUNK = 500;
  for (let i = 0; i < allUsers.length; i += CHUNK) {
    const chunk = allUsers.slice(i, i + CHUNK);
    await db.insert(userNotifications).values(
      chunk.map((u) => ({
        userId: u.id,
        type: "system_announcement" as any,
        title,
        content,
      }))
    );
  }

  return allUsers.length;
}

/**
 * 调度定时任务（每分钟执行）
 */
import cron from "node-cron";

export function schedulePublishAnnouncements() {

  cron.schedule("* * * * *", async () => {
    try {
      await runPublishAnnouncements();
    } catch (err) {
      console.error("[Cron] Scheduled announcement publish error:", err);
    }
  });

  console.log("[Cron] Scheduled announcement publish scheduled: every minute");
}

// ============================================================
//  3cloud (3C) — 用户偏好服务
//  功能：按用户+页面存储/读取筛选条件等 UI 偏好
// ============================================================

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { userPreferences } from "../db/schema.js";
import { AppError } from "./auth-service/index.js";

// ──────────────────────────────────────────────
//  获取用户某页面的偏好
// ──────────────────────────────────────────────

export async function getPreferences(userId: number, pageKey: string): Promise<Record<string, any>> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.pageKey, pageKey),
      ),
    )
    .limit(1);

  return (row?.filters as Record<string, any>) ?? {};
}

// ──────────────────────────────────────────────
//  保存用户某页面的偏好（upsert）
// ──────────────────────────────────────────────

export async function savePreferences(
  userId: number,
  pageKey: string,
  filters: Record<string, any>,
): Promise<void> {
  const db = getDb();

  const [existing] = await db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.pageKey, pageKey),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(userPreferences)
      .set({
        filters: filters as any,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.id, existing.id));
  } else {
    await db
      .insert(userPreferences)
      .values({
        userId,
        pageKey,
        filters: filters as any,
      });
  }
}

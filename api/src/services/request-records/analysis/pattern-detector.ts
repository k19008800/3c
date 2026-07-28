// ============================================================
//  3cloud (3C) — 异常请求模式检测器
//  检测短时间内大量相似请求、异常时段、请求体异常大、重复失败
// ============================================================

import { getDb } from "../../../db/index.js";
import { requestRecords, callLogs } from "../../../db/schema.js";
import { eq, and, gte, lt, count, sql, inArray } from "drizzle-orm";

export interface PatternDetectionResult {
  isAnomaly: boolean;
  tags: string[];
  reason: string;
}

/**
 * 检测异常请求模式
 * @param recordId 请求记录 ID
 * @param userId 用户 ID
 * @param requestBodySize 请求体大小
 * @param createdAt 记录创建时间
 */
export async function detectPatterns(
  recordId: bigint,
  userId: number,
  requestBodySize: number,
  createdAt: Date,
): Promise<PatternDetectionResult> {
  const tags: string[] = [];
  const reasons: string[] = [];
  const db = getDb();

  const now = createdAt;

  // ── 检测 1: 短时间内大量请求（过去 5 分钟内同一用户的请求数）──
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const [recentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requestRecords)
    .where(
      and(
        eq(requestRecords.userId, userId),
        gte(requestRecords.createdAt, fiveMinAgo),
        lt(requestRecords.createdAt, now),
      )
    );

  if (recentCount && recentCount.count > 50) {
    tags.push("high_frequency");
    reasons.push(`过去5分钟请求数: ${recentCount.count}`);
  } else if (recentCount && recentCount.count > 20) {
    tags.push("frequent_requests");
    reasons.push(`过去5分钟请求数: ${recentCount.count}`);
  }

  // ── 检测 2: 异常时段（凌晨 2-5 点）──
  const hour = now.getHours();
  if (hour >= 2 && hour < 5) {
    tags.push("off_hour_access");
    reasons.push(`异常时段访问: ${hour}:00`);
  }

  // ── 检测 3: 请求体异常大（超过 50KB）──
  if (requestBodySize > 50 * 1024) {
    tags.push("large_request_body");
    reasons.push(`请求体异常大: ${(requestBodySize / 1024).toFixed(1)}KB`);
  }

  // ── 检测 4: 重复失败（最近 10 条中失败比例高）──
  const recentRecords = await db
    .select({ status: callLogs.status })
    .from(requestRecords)
    .innerJoin(callLogs, eq(requestRecords.callLogId, callLogs.id))
    .where(
      and(
        eq(requestRecords.userId, userId),
        lt(requestRecords.createdAt, now),
      )
    )
    .orderBy(sql`${requestRecords.createdAt} DESC`)
    .limit(10);

  if (recentRecords.length > 0) {
    const failedCount = recentRecords.filter(
      (r) => r.status === "failed" || r.status === "timeout"
    ).length;
    if (failedCount >= 5) {
      tags.push("high_failure_rate");
      reasons.push(`最近10次请求中失败: ${failedCount}次`);
    }
  }

  return {
    isAnomaly: tags.length > 0,
    tags,
    reason: reasons.join("; "),
  };
}
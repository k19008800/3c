// ============================================================
//  3cloud (3C) — 风险分析执行器
//  统一入口，按顺序执行三个检测器，更新数据库
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { requestRecords } from "../../../db/schema.js";
import { detectSensitiveInObject } from "./sensitive-detector.js";
import { detectPatterns } from "./pattern-detector.js";
import { assessRisk } from "./risk-scorer.js";

/**
 * 对指定请求记录执行风险分析
 * 读取记录 → 敏感词检测 → 模式检测 → 综合评分 → 更新数据库
 */
export async function runAnalysis(recordId: bigint): Promise<void> {
  try {
    const db = getDb();

    // 读取记录
    const [record] = await db
      .select()
      .from(requestRecords)
      .where(eq(requestRecords.id, recordId))
      .limit(1);

    if (!record) {
      console.warn(`[RequestRecords] 分析跳过: 记录 ${recordId} 不存在`);
      return;
    }

    // ── 1. 敏感内容检测 ──
    const sensitiveResult = detectSensitiveInObject(record.requestBody);

    // 如果存在响应体，也检测
    if (record.responseBody) {
      const responseSensitive = detectSensitiveInObject(record.responseBody);
      if (responseSensitive.hasSensitive) {
        sensitiveResult.tags.push(...responseSensitive.tags);
        if (responseSensitive.highPriorityMatch) {
          sensitiveResult.highPriorityMatch = true;
        }
      }
    }

    // 如果存在流式内容，也检测
    if (record.streamContent) {
      const { detectSensitiveContent } = await import("./sensitive-detector.js");
      const streamResult = detectSensitiveContent(record.streamContent);
      if (streamResult.hasSensitive) {
        sensitiveResult.tags.push(...streamResult.tags);
        if (streamResult.highPriorityMatch) {
          sensitiveResult.highPriorityMatch = true;
        }
      }
    }

    // ── 2. 异常模式检测 ──
    const patternResult = await detectPatterns(
      recordId,
      record.userId,
      record.requestBodySize,
      record.createdAt,
    );

    // ── 3. 综合评分 ──
    const riskResult = assessRisk(sensitiveResult, patternResult);

    // ── 4. 更新数据库 ──
    await db
      .update(requestRecords)
      .set({
        riskLevel: riskResult.riskLevel,
        riskTags: riskResult.riskTags,
        riskReason: riskResult.riskReason,
      })
      .where(eq(requestRecords.id, recordId));

    if (riskResult.riskLevel !== "normal") {
      console.log(
        `[RequestRecords] 分析完成 (id=${recordId}): ${riskResult.riskLevel}`,
        riskResult.riskTags
      );
    }
  } catch (err) {
    console.error(`[RequestRecords] 分析异常 (id=${recordId}):`, err);
  }
}
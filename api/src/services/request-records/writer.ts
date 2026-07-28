// ============================================================
//  3cloud (3C) — 请求记录写入服务
//  异步写入 request_records 表，非阻塞，不增加代理延迟
// ============================================================

import { getDb } from "../../db/index.js";
import { requestRecords } from "../../db/schema.js";
import { runAnalysis } from "./analysis/runner.js";

// 单个字段最大大小（字节），超过则截断
const MAX_FIELD_SIZE = 100 * 1024; // 100KB

/**
 * 截断过大的 JSON 数据，保留结构但截断长字符串值
 */
function truncateLargeJson(data: unknown, maxBytes: number = MAX_FIELD_SIZE): unknown {
  if (data === null || data === undefined) return data;

  const str = JSON.stringify(data);
  if (str.length <= maxBytes) return data;

  // 如果整体 JSON 字符串超过限制，截断并添加标记
  // 尝试保留外层结构
  if (typeof data === "string") {
    return data.slice(0, maxBytes) + "... [截断]";
  }

  if (Array.isArray(data)) {
    const result: unknown[] = [];
    let totalSize = 2; // []
    for (const item of data) {
      const itemStr = JSON.stringify(item);
      if (totalSize + itemStr.length + 1 > maxBytes) break;
      result.push(truncateLargeJson(item, maxBytes - totalSize));
      totalSize += itemStr.length + 1;
    }
    return result;
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    let totalSize = 2; // {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const pairStr = JSON.stringify({ [key]: value });
      if (totalSize + pairStr.length > maxBytes) break;
      result[key] = truncateLargeJson(value, maxBytes - totalSize);
      totalSize += pairStr.length;
    }
    return result;
  }

  return data;
}

export interface SaveRequestRecordInput {
  callLogId: bigint | number;
  userId: number;
  apiKeyId?: number | null;
  modelId?: number | null;
  modelName?: string | null;
  vendorName?: string | null;
  requestBody: unknown;
  requestHeaders?: Record<string, string> | null;
  responseBody?: unknown;
  responseStatus?: number | null;
  isStreaming?: boolean;
  streamContent?: string;
}

/**
 * 保存请求记录并异步触发风险分析
 * 非阻塞调用，不抛出异常
 */
export async function saveRequestRecord(input: SaveRequestRecordInput): Promise<void> {
  try {
    const db = getDb();

    // 对请求体/响应体做大小截断
    const truncatedRequestBody = truncateLargeJson(input.requestBody);
    const truncatedResponseBody = input.responseBody ? truncateLargeJson(input.responseBody) : null;

    // 计算原始大小
    const requestBodyStr = JSON.stringify(input.requestBody);
    const responseBodyStr = input.responseBody ? JSON.stringify(input.responseBody) : null;

    // 对请求头做 sanitize（移除敏感信息）
    let sanitizedHeaders: Record<string, string> | null = null;
    if (input.requestHeaders) {
      sanitizedHeaders = { ...input.requestHeaders };
      // 移除敏感头
      const sensitiveHeaders = ["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"];
      for (const h of sensitiveHeaders) {
        delete sanitizedHeaders[h];
        // 也移除大小写变体
        const lowerH = h.toLowerCase();
        for (const key of Object.keys(sanitizedHeaders)) {
          if (key.toLowerCase() === lowerH) {
            delete sanitizedHeaders[key];
          }
        }
      }
    }

    const [record] = await db.insert(requestRecords).values({
      callLogId: typeof input.callLogId === 'number' ? BigInt(input.callLogId) : input.callLogId,
      userId: input.userId,
      apiKeyId: input.apiKeyId ?? null,
      modelId: input.modelId ?? null,
      modelName: input.modelName ?? null,
      vendorName: input.vendorName ?? null,
      requestBody: truncatedRequestBody as Record<string, unknown>,
      requestHeaders: sanitizedHeaders as Record<string, unknown> | null,
      requestBodySize: requestBodyStr.length,
      responseBody: truncatedResponseBody as Record<string, unknown> | null,
      responseBodySize: responseBodyStr?.length ?? 0,
      responseStatus: input.responseStatus ?? null,
      isStreaming: input.isStreaming ?? false,
      streamContent: input.streamContent ?? null,
      riskLevel: "normal",
    }).returning({ id: requestRecords.id });

    // 异步触发基础分析（不阻塞）
    if (record) {
      runAnalysis(record.id).catch((err) => {
        console.error(`[RequestRecords] 分析失败 (id=${record.id}):`, err);
      });
    }
  } catch (err) {
    // 静默记录错误，不阻塞主流程
    console.error("[RequestRecords] 写入失败:", err);
  }
}
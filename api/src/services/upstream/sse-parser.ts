/**
 * SSE 逐行解析器 — 处理跨 buffer 边界的 SSE 数据行
 *
 * 职责：
 * - 接收上游原始文本 chunk，按行缓冲拼接
 * - 处理跨 buffer 边界的 SSE 行（JSON 被截断在两次 read 中 → 按行缓冲拼接）
 * - 解析 "data: {...}" → 提取 JSON payload
 * - 识别 "data: [DONE]" 终止信号
 *
 * @see newapi-migration-guide.md §2.1 SSE 流式转发
 * @module services/upstream
 */

/** 单条已解析的 SSE 行 */
export interface ParsedSseLine {
  /** 完整的原始行（含 "data: " 前缀），用于原样转发给客户端 */
  raw: string;
  /** "data: " 后的内容 */
  data: string;
  /** 是否为 [DONE] 终止信号 */
  isDone: boolean;
  /** JSON 解析结果（非 JSON 行或解析失败时为 undefined） */
  parsed?: Record<string, unknown>;
}

/**
 * SSE 行缓冲解析器
 *
 * 维护内部缓冲区，每次 feed() 追加文本并返回完整的行。
 * 不完整的行（以 \n 结尾但 JSON 跨 chunk 被截断）保留在缓冲区中，等待下次 feed()。
 */
export class SseLineBuffer {
  private buffer = "";

  /**
   * 喂入原始文本，返回本次可处理的完整 SSE 行。
   * 跨 chunk 的不完整行会自动保留在内部缓冲区。
   *
   * @param text - 原始文本（可能包含多个 \n 分隔的行，可能以不完整的行结尾）
   * @returns 完整的 SSE 行数组（未解析 JSON）
   */
  feed(text: string): string[] {
    this.buffer += text;

    // 按 \n 分割，最后一段可能是不完整的行 → 保留在 buffer
    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() ?? "";

    // 过滤掉空行，保留所有非空行
    return parts.filter((line) => line.length > 0);
  }

  /**
   * 刷新缓冲区：返回当前缓冲区中剩余的文本（如果有），并清空缓冲区。
   * 在流结束时调用，确保不丢失最后一行。
   *
   * @returns 缓冲区中剩余的行（可能为空数组）
   */
  flush(): string[] {
    if (this.buffer.length > 0) {
      const remaining = this.buffer;
      this.buffer = "";
      return [remaining];
    }
    return [];
  }

  /** 重置缓冲区 */
  reset(): void {
    this.buffer = "";
  }
}

/**
 * 解析单条 SSE 行（已去除 \n，可能以 \r 结尾）
 *
 * @param line - 单行文本（不含 \n）
 * @returns 解析结果，非 data: 行返回 null
 */
export function parseSseLine(line: string): ParsedSseLine | null {
  // 去除行尾 \r
  const clean = line.endsWith("\r") ? line.slice(0, -1) : line;

  // 只处理 data: 开头的行
  if (!clean.startsWith("data: ")) {
    // 非 data: 行（如 event:, id:, retry: 等）→ 原样转发但不解析
    return {
      raw: clean,
      data: clean,
      isDone: false,
    };
  }

  const data = clean.slice(6); // 去掉 "data: "

  // [DONE] 终止信号
  if (data === "[DONE]") {
    return { raw: clean, data, isDone: true };
  }

  // 尝试 JSON 解析
  let parsed: Record<string, unknown> | undefined;
  try {
    const obj = JSON.parse(data);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      parsed = obj as Record<string, unknown>;
    }
  } catch {
    // 非 JSON 的 data: 行 → 跳过解析，保留 raw 用于转发
  }

  return { raw: clean, data, isDone: false, parsed };
}

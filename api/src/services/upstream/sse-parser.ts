/**
 * SSE 流式解析器 — 处理跨 buffer 边界的 SSE 数据行
 *
 * 职责：
 * - 逐行解析 SSE 数据帧
 * - 处理 data: 行跨 buffer 边界的情况（如 `data: {` 和 `"choices":...}` 分两次到达）
 * - 回调模式：每解析出一行即调用 callback
 *
 * @module services/upstream
 */

/** SSE 行回调：接收解析出的 data: 内容（不含 "data: " 前缀） */
export type SSELineCallback = (line: string, isData: boolean) => void;

/**
 * SSE 解析器 — 累积 buffer 并按行分派
 *
 * 算法：
 *  1. 新数据追加到 buffer
 *  2. 按 \n 分割
 *  3. 完整行 → 调用 callback
 *  4. 不完整的最后一行 → 保留在 buffer 中等待下一批数据
 *
 * @param bufferRef - 累积 buffer 的引用（会被原地修改）
 * @param chunk - 新到达的字符串数据
 * @param callback - 每行触发一次
 */
export function parseSSELines(
  bufferRef: { value: string },
  chunk: string,
  callback: SSELineCallback,
): void {
  bufferRef.value += chunk;

  // 按 \n 分割，最后一段是不完整的行（保留）
  const lines = bufferRef.value.split('\n');
  // 最后一段可能是空字符串（如果以 \n 结尾）或不完整行
  bufferRef.value = lines.pop() ?? '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      callback(line.slice(6), true);
    } else {
      callback(line, false);
    }
  }
}

/**
 * 解析完整的 SSE 行数组（已按 \n 分割好的行列表）
 *
 * 用于不涉及跨 buffer 边界的简单场景。
 *
 * @param lines - 已分割的行数组
 * @param callback - 每行触发一次
 */
export function parseSSELinesArray(
  lines: string[],
  callback: SSELineCallback,
): void {
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      callback(line.slice(6), true);
    } else {
      callback(line, false);
    }
  }
}

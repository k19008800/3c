/**
 * 多模态请求体预处理 — 递归处理请求体中的 base64 数据
 *
 * 职责：
 * - 遍历 OpenAI messages 数组，找出 image_url / input_audio 中的 base64 data URI
 * - 小于阈值的 base64 → 原样转发，不处理
 * - 大于阈值的 base64 → 上传到临时文件存储，替换为内网 URL
 * - 请求完成后支持 TTL 清理
 *
 * 处理范围：
 * - 仅处理 image_url 和 input_audio 中的 base64
 * - text 类型不处理
 * - 混合 content（同时有 text + image_url）→ 只处理 image 部分
 * - 无 base64 的纯文本请求 → 直接返回原 body，不触发预处理
 *
 * @module services/upstream
 */

import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 默认最大内联二进制大小：10 MB */
const DEFAULT_MAX_INLINE_BYTES = 10 * 1024 * 1024;

/** 默认临时文件根目录（相对 monorepo 根） */
const DEFAULT_TEMP_BASE_DIR = 'apps/api/tmp/multimodal';

/** 默认内网 URL 前缀 */
const DEFAULT_INTERNAL_URL_PREFIX = 'http://localhost:3000/internal/tmp';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 预处理配置选项 */
export interface PreprocessOptions {
  /** 最大内联二进制大小（字节），超过则上传临时存储。默认 10 MB */
  maxInlineBytes?: number;
  /** 临时文件根目录路径。默认 'apps/api/tmp/multimodal' */
  tempBaseDir?: string;
  /** 内网 URL 前缀。默认 'http://localhost:3000/internal/tmp' */
  internalUrlPrefix?: string;
}

/** 预处理结果 */
export interface PreprocessResult {
  /** 处理后的请求体 */
  body: Record<string, unknown>;
  /** 创建的临时文件路径列表 */
  tempFiles: string[];
  /** 是否有超大媒体被替换 */
  hasLargeMedia: boolean;
}

// ---------------------------------------------------------------------------
// 导出函数
// ---------------------------------------------------------------------------

/**
 * 预处理请求体中的 base64 媒体数据
 *
 * 递归遍历请求体的 messages 数组，对 image_url 和 input_audio 中的
 * base64 data URI 进行大小检查。超过阈值的上传到临时文件存储，替换为
 * 内网 URL；未超过阈值的原样保留。
 *
 * @param body - OpenAI 格式的请求体
 * @param requestId - 请求 ID，用于生成临时文件路径。默认自动生成 UUID
 * @param options - 预处理配置选项
 * @returns 处理结果，包含修改后的请求体、临时文件列表和是否有超大媒体标志
 *
 * @example
 * ```ts
 * const result = await preprocessRequestBody({
 *   model: 'gpt-4o',
 *   messages: [{
 *     role: 'user',
 *     content: [
 *       { type: 'text', text: '描述这张图' },
 *       { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
 *     ],
 *   }],
 * });
 * // result.hasLargeMedia → false（小于 10MB）
 * // result.body → 原样
 * ```
 */
export async function preprocessRequestBody(
  body: Record<string, unknown>,
  requestId: string = randomUUID(),
  options: PreprocessOptions = {},
): Promise<PreprocessResult> {
  const {
    maxInlineBytes = DEFAULT_MAX_INLINE_BYTES,
    tempBaseDir = DEFAULT_TEMP_BASE_DIR,
    internalUrlPrefix = DEFAULT_INTERNAL_URL_PREFIX,
  } = options;

  const tempFiles: string[] = [];
  let hasLargeMedia = false;

  const onLarge = (): void => {
    hasLargeMedia = true;
  };

  const processedBody = await processValue(body, {
    tempFiles,
    requestId,
    maxInlineBytes,
    tempBaseDir,
    internalUrlPrefix,
    onLarge,
  });

  return {
    body: processedBody as Record<string, unknown>,
    tempFiles,
    hasLargeMedia,
  };
}

/**
 * 清理请求的临时文件列表
 *
 * 移除指定路径下的所有临时文件。单个文件删除失败不阻塞其他文件的清理。
 *
 * @param filePaths - 要清理的文件路径列表（来自 {@link PreprocessResult.tempFiles}）
 *
 * @example
 * ```ts
 * const { tempFiles } = await preprocessRequestBody(body);
 * // ... 请求处理完成后
 * await cleanupTempFiles(tempFiles);
 * ```
 */
export async function cleanupTempFiles(filePaths: string[]): Promise<void> {
  // 延迟导入以减少无关场景的模块加载
  const { rm } = await import('node:fs/promises');
  for (const fp of filePaths) {
    try {
      await rm(fp, { force: true });
    } catch {
      // 清理失败不阻塞其他文件清理，也不抛异常
    }
  }
}

/**
 * 清理超过 TTL 的临时文件目录
 *
 * 扫描临时文件根目录，删除 mtime 超过 TTL 的所有子目录。
 * 目录不存在等异常静默处理。
 *
 * @param ttlMs - 生存时间（毫秒），默认 5 分钟
 * @returns 清理的目录数量
 *
 * @example
 * ```ts
 * // 每分钟调度一次
 * setInterval(() => cleanupExpiredFiles(), 60_000);
 * ```
 */
export async function cleanupExpiredFiles(
  ttlMs: number = 5 * 60 * 1000,
  tempBaseDir: string = DEFAULT_TEMP_BASE_DIR,
): Promise<number> {
  const { readdir, stat, rm } = await import('node:fs/promises');
  const now = Date.now();
  let removed = 0;

  try {
    const entries = await readdir(tempBaseDir);
    for (const entry of entries) {
      const entryPath = join(tempBaseDir, entry);
      try {
        const entryStat = await stat(entryPath);
        if (now - entryStat.mtimeMs > ttlMs) {
          await rm(entryPath, { recursive: true, force: true });
          removed++;
        }
      } catch {
        // 单个 entry 读取/删除失败不阻塞
      }
    }
  } catch {
    // 目录不存在等场景静默处理
  }

  return removed;
}

// ---------------------------------------------------------------------------
// 内部处理上下文
// ---------------------------------------------------------------------------

/** 预处理过程的内部状态 */
interface ProcessContext {
  tempFiles: string[];
  requestId: string;
  maxInlineBytes: number;
  tempBaseDir: string;
  internalUrlPrefix: string;
  onLarge: () => void;
}

// ---------------------------------------------------------------------------
// 内部函数
// ---------------------------------------------------------------------------

/**
 * 递归处理任意 JSON 值
 *
 * 对 content 为数组的消息进行专项处理（检查 image_url/input_audio），
 * 其他值递归遍历。
 */
async function processValue(
  obj: unknown,
  ctx: ProcessContext,
): Promise<unknown> {
  if (Array.isArray(obj)) {
    return Promise.all(obj.map((v) => processValue(v, ctx)));
  }

  if (typeof obj === 'object' && obj !== null) {
    const record = obj as Record<string, unknown>;

    // 专项处理：消息 content 是数组（多模态消息）
    if ('content' in record && Array.isArray(record.content)) {
      const processed = { ...record };
      processed.content = await Promise.all(
        (record.content as unknown[]).map((part) => processContentPart(part, ctx)),
      );
      return processed;
    }

    // 普通对象：递归遍历每个属性
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = await processValue(value, ctx);
    }
    return result;
  }

  // 原始值直接返回
  return obj;
}

/**
 * 处理多模态 content 数组中的单个部分
 *
 * 仅对 type === 'image_url' 或 'input_audio' 的部分处理其中的 base64。
 * text 等其他类型原样返回。
 */
async function processContentPart(
  part: unknown,
  ctx: ProcessContext,
): Promise<unknown> {
  if (typeof part !== 'object' || part === null) return part;

  const p = part as Record<string, unknown>;

  // 处理 image_url
  if (p.type === 'image_url' && p.image_url && typeof p.image_url === 'object') {
    const img = p.image_url as Record<string, unknown>;
    if (typeof img.url === 'string') {
      const processed = await handleBase64Field(img.url, ctx);
      return { ...p, image_url: { ...img, url: processed } };
    }
  }

  // 处理 input_audio
  if (p.type === 'input_audio' && p.input_audio && typeof p.input_audio === 'object') {
    const audio = p.input_audio as Record<string, unknown>;
    if (typeof audio.data === 'string') {
      const processed = await handleBase64Field(audio.data, ctx);
      return { ...p, input_audio: { ...audio, data: processed } };
    }
  }

  // text 等其他类型原样返回
  return part;
}

/**
 * 检查并处理单个 base64 字段
 *
 * 如果不是 base64 data URI → 原样返回。
 * 如果二进制大小 <= maxInlineBytes → 原样返回。
 * 如果二进制大小 > maxInlineBytes → 写入临时文件，返回内网 URL。
 *
 * @param value - 可能是 data URI 的字符串
 * @param ctx - 处理上下文
 * @returns 原值或内网 URL
 */
async function handleBase64Field(
  value: string,
  ctx: ProcessContext,
): Promise<string> {
  // 不是 data URI → 不处理
  if (!value.startsWith('data:')) return value;

  // 解析 data URI：data:<mime>;base64,<payload>
  const matches = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return value;

  const [, mimeType, base64Data] = matches;

  // 估算二进制大小：base64 编码 4 字符 ≈ 3 字节
  const binarySize = Math.ceil((base64Data.length * 3) / 4);

  // 未超过阈值 → 原样转发
  if (binarySize <= ctx.maxInlineBytes) {
    return value;
  }

  // 超过阈值 → 写入临时文件
  ctx.onLarge();

  const ext = mimeType.split('/')[1] || 'bin';
  const filename = `${randomUUID()}.${ext}`;
  const tmpDir = join(ctx.tempBaseDir, ctx.requestId);
  const filePath = join(tmpDir, filename);

  await mkdir(tmpDir, { recursive: true });
  await writeFile(filePath, Buffer.from(base64Data, 'base64'));
  ctx.tempFiles.push(filePath);

  return `${ctx.internalUrlPrefix}/${ctx.requestId}/${filename}`;
}

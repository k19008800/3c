/**
 * 多模态 Token 估算器 — OpenAI 多模态 content 数组的细粒度计费估算
 *
 * 职责：
 * - estimateImageTokens：按尺寸/detail 估算单张图片 token（OpenAI 规则简化版）
 * - estimateAudioTokens：按时长 × 速率估算音频 token
 * - estimateMultimodalContentTokens：解析 OpenAI 多模态 content 数组，
 *   混合统计 text / images / audio 三类 token
 *
 * 设计约束：
 * - 纯函数、无 DB 依赖、无网络请求（图片 URL 无法抓取，按默认尺寸兜底）
 * - countText 回调可注入（chat.ts 注入 tiktoken 计数；默认简单估算 chars/3）
 * - 只做估算，不参与转发与结算
 *
 * 简化说明（与 OpenAI 官方规则的差异）：
 * - OpenAI high detail：缩放至 2048 上限 → 最短边缩至 768 → tiles = ceil(长边/512)
 * - 本实现：缩放至 2048 上限 → tiles = ceil(长边/512)，省略"最短边 768"步骤。
 *   对大图结果偏保守（略高估），对 ≤2048 且短边 ≥768 的图与官方一致。
 *
 * @module services/billing
 * @see newapi-gap-analysis.md Batch 4 任务 4.3 多模态细粒度计费
 */

// ============================================================
// 常量（数值来源见 OpenAI vision 计费文档）
// ============================================================

/** low detail 图片固定 token 数 */
const BASE_IMAGE_TOKENS = 85;
/** 每个 tile 的增量 token 数 */
const TILE_TOKENS = 170;
/** tile 边长（像素） */
const TILE_SIZE = 512;
/** high detail 缩放上限：长边超过 2048 先等比缩小 */
const MAX_IMAGE_SIDE = 2048;
/** 无法解析尺寸时的默认边长（512×512 high 规则） */
const DEFAULT_IMAGE_SIZE = 512;
/** 音频默认 token 速率（token / 秒），whisper 类模型约 32 tokens/s */
const DEFAULT_AUDIO_RATE = 32;
/** 音频默认码率（字节/秒）：16kHz 16bit 单声道 PCM 的简化假设 */
const DEFAULT_AUDIO_BYTES_PER_SECOND = 32000;
/** 默认文本估算：约 3 字符 = 1 token */
const DEFAULT_CHARS_PER_TOKEN = 3;

/** 图片 detail 合法取值 */
type ImageDetail = 'low' | 'high' | 'auto';

// ============================================================
// Types
// ============================================================

/** 单张图片的估算结果 */
export interface ImageTokenEstimate {
  /** 估算 token 数 */
  tokens: number;
  /** 高 detail 下的 tile 数（low detail 恒为 0，无 tile 概念） */
  tiles: number;
}

/** 多模态 content 数组的估算结果 */
export interface MultimodalTokenEstimate {
  /** 总 token 数（text + images + audio） */
  totalTokens: number;
  /** 分类明细：text=文本/JSON 序列化内容，images=图片，audio=音频 */
  breakdown: {
    text: number;
    images: number;
    audio: number;
  };
}

// ============================================================
// 图片 Token 估算
// ============================================================

/**
 * 估算单张图片的 token 数（OpenAI 规则简化版）
 *
 * 规则：
 * - low → 固定 85 tokens
 * - high/auto → 85 + tiles × 170，其中 tiles = ceil(长边/512)，
 *   长边超过 2048 先等比缩放至 2048（见文件头"简化说明"）
 * - 非法尺寸（<=0 / NaN）按 512×512 处理
 *
 * @param width - 图片宽度（像素），须为正数
 * @param height - 图片高度（像素），须为正数
 * @param detail - 图片细节级别：low | high | auto（默认 auto，等同 high）
 * @returns { tokens, tiles }
 *
 * @example
 * ```ts
 * estimateImageTokens(512, 512, 'high'); // { tokens: 255, tiles: 1 }
 * estimateImageTokens(1024, 1024);       // { tokens: 425, tiles: 2 }
 * estimateImageTokens(512, 512, 'low');  // { tokens: 85, tiles: 0 }
 * ```
 */
export function estimateImageTokens(
  width: number,
  height: number,
  detail: ImageDetail = 'auto',
): ImageTokenEstimate {
  // 非法输入兜底：计费估算不允许抛错，统一按默认 512×512 处理
  const w = Number.isFinite(width) && width > 0 ? Math.floor(width) : DEFAULT_IMAGE_SIZE;
  const h = Number.isFinite(height) && height > 0 ? Math.floor(height) : DEFAULT_IMAGE_SIZE;

  // low detail：固定 85 tokens，不参与 tile 计算
  if (detail === 'low') {
    return { tokens: BASE_IMAGE_TOKENS, tiles: 0 };
  }

  // high/auto：长边超过 2048 先等比缩放（OpenAI 规则第一步）
  const maxSide = Math.max(w, h);
  const scale = maxSide > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / maxSide : 1;
  const scaledW = Math.ceil(w * scale);
  const scaledH = Math.ceil(h * scale);

  // 切 tile：按缩放后的长边计 tile 数
  const tiles = Math.max(1, Math.ceil(Math.max(scaledW, scaledH) / TILE_SIZE));
  const tokens = BASE_IMAGE_TOKENS + TILE_TOKENS * tiles;

  return { tokens, tiles };
}

// ============================================================
// 音频 Token 估算
// ============================================================

/**
 * 估算音频的 token 数（按时长 × 速率）
 *
 * @param durationSeconds - 音频时长（秒），须为非负数
 * @param ratePerSecond - 每秒 token 数（默认 32，whisper 类模型经验值）
 * @returns token 数（向上取整）
 *
 * @example
 * ```ts
 * estimateAudioTokens(10); // 320
 * estimateAudioTokens(3.2); // Math.ceil(3.2 * 32) = 103
 * ```
 */
export function estimateAudioTokens(
  durationSeconds: number,
  ratePerSecond: number = DEFAULT_AUDIO_RATE,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0) return 0;
  return Math.ceil(durationSeconds * ratePerSecond);
}

// ============================================================
// 多模态 content 数组估算
// ============================================================

/**
 * 解析 OpenAI 多模态 content 数组并估算 token 数
 *
 * 支持的元素形态：
 * - string → 文本，走 countText 回调
 * - { type:'text', text } → 文本，走 countText 回调
 * - { type:'image_url', image_url:{ url, detail } } → 图片
 *   - data:image/...;base64 → 解码头解析 PNG/JPEG/GIF/WebP 宽高
 *   - 无法解析 → 按 base64 长度估算像素（约 2 bytes/pixel）
 *   - 普通 URL / 无信息 → 默认 512×512 high 规则（纯函数不发起网络请求）
 * - { type:'input_audio', input_audio:{ data } } → 音频
 *   - 优先解析 WAV 头（dataSize / byteRate 得时长）
 *   - 否则按 base64 字节数 / 假定码率（32000 B/s）估时长
 * - 其他类型 → 原样 JSON.stringify 后按文本计（覆盖 tool_call 等结构）
 *
 * @param content - OpenAI 多模态 content 数组
 * @param model - 模型名称（保留参数，供未来按模型差异化估算；当前不影响结果）
 * @param opts.countText - 文本计数回调（chat.ts 注入 tiktoken 计数）；
 *   缺省时用简单估算 Math.ceil(chars / 3)
 * @returns { totalTokens, breakdown: { text, images, audio } }
 *
 * @example
 * ```ts
 * estimateMultimodalContentTokens(
 *   ['你好', { type: 'image_url', image_url: { url: 'data:image/png;base64,...', detail: 'high' } }],
 *   'gpt-4o',
 *   { countText: (t) => countTokens(t, 'gpt-4o') },
 * );
 * ```
 */
export function estimateMultimodalContentTokens(
  content: unknown[],
  model: string,
  opts: { countText?: (text: string) => number } = {},
): MultimodalTokenEstimate {
  // 文本计数回调：缺省用简单估算，调用方可注入 tiktoken 精确计数
  const countText = opts.countText ?? ((text: string) => Math.ceil(text.length / DEFAULT_CHARS_PER_TOKEN));

  const breakdown = { text: 0, images: 0, audio: 0 };

  if (!Array.isArray(content)) {
    // 非数组入参（防御性）：按 JSON 序列化计文本 token
    breakdown.text += countText(JSON.stringify(content));
    return { totalTokens: breakdown.text, breakdown };
  }

  for (const part of content) {
    // 1. 纯字符串 → 文本
    if (typeof part === 'string') {
      breakdown.text += countText(part);
      continue;
    }

    // 2. 对象形态 → 按 type 分发
    if (part && typeof part === 'object') {
      const p = part as Record<string, unknown>;

      // 2.1 图片
      if (p.type === 'image_url') {
        breakdown.images += estimateImagePartTokens(p);
        continue;
      }

      // 2.2 音频
      if (p.type === 'input_audio') {
        breakdown.audio += estimateAudioPartTokens(p);
        continue;
      }

      // 2.3 显式文本块（OpenAI vision 格式也允许 { type:'text', text }）
      if (p.type === 'text' && typeof p.text === 'string') {
        breakdown.text += countText(p.text);
        continue;
      }

      // 2.4 其他类型（tool_call、file 等）→ 原样 JSON 序列化计 token
      // 归入 text 桶：序列化后的内容本质是文本
      breakdown.text += countText(JSON.stringify(p));
      continue;
    }

    // 3. 数字/布尔等标量（防御性）→ 字符串化计 token
    breakdown.text += countText(String(part));
  }

  const totalTokens = breakdown.text + breakdown.images + breakdown.audio;
  return { totalTokens, breakdown };
}

// ============================================================
// Helpers（内部实现，不导出）
// ============================================================

/**
 * 估算单个 image_url 元素的 token 数
 *
 * 优先解析 data URL 中的图片头获取真实宽高；解析失败按 base64
 * 长度估算像素；普通 URL（无法抓取，纯函数约束）按默认 512×512。
 *
 * @param part - content 数组中的 image_url 元素
 * @returns token 数
 */
function estimateImagePartTokens(part: Record<string, unknown>): number {
  const imageUrl = (part.image_url && typeof part.image_url === 'object' ? part.image_url : {}) as Record<string, unknown>;
  const detail = normalizeDetail(imageUrl.detail);
  const url = typeof imageUrl.url === 'string' ? imageUrl.url : '';

  let width = DEFAULT_IMAGE_SIZE;
  let height = DEFAULT_IMAGE_SIZE;

  if (url.startsWith('data:image/')) {
    // base64 data URL → 尝试解析真实尺寸
    const dims = estimateImageFromBase64(url);
    if (dims) {
      width = dims.width;
      height = dims.height;
    }
    // 解析失败：保持默认 512×512（width/height 未更新）
  }

  return estimateImageTokens(width, height, detail).tokens;
}

/**
 * 估算单个 input_audio 元素的 token 数
 *
 * @param part - content 数组中的 input_audio 元素
 * @returns token 数
 */
function estimateAudioPartTokens(part: Record<string, unknown>): number {
  const inputAudio = (part.input_audio && typeof part.input_audio === 'object' ? part.input_audio : {}) as Record<string, unknown>;
  const data = typeof inputAudio.data === 'string' ? inputAudio.data : '';
  const seconds = estimateAudioSeconds(data);
  return estimateAudioTokens(seconds);
}

/** 归一化 detail 字段：只接受 low/high/auto，其余按 auto 处理 */
function normalizeDetail(detail: unknown): ImageDetail {
  return detail === 'low' || detail === 'high' || detail === 'auto' ? detail : 'auto';
}

/**
 * 从图片 base64 data URL 解析宽高
 *
 * 支持 PNG / JPEG / GIF / WebP 头部解析；解析失败返回 null。
 *
 * @param dataUrl - data:image/<format>;base64,<data> 格式的 URL
 * @returns { width, height } 或 null
 */
function estimateImageFromBase64(dataUrl: string): { width: number; height: number } | null {
  // 提取格式与 base64 数据
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/i);
  if (!match) return null;
  const format = match[1]!.toLowerCase();
  const base64 = match[2]!;

  // 优先解析真实图片头
  try {
    const buf = Buffer.from(base64, 'base64');
    const dims = parseImageHeader(format, buf);
    if (dims) return dims;
  } catch {
    /* 头解析失败 → 走 base64 长度估算 */
  }

  // 简化估算：base64 长度 → 字节数，假设约 2 bytes/pixel，按正方形近似
  const bytes = Math.floor((base64.length * 3) / 4);
  const pixels = Math.max(1, Math.floor(bytes / 2));
  const side = Math.max(1, Math.round(Math.sqrt(pixels)));
  return { width: side, height: side };
}

/**
 * 解析图片二进制头的宽高
 *
 * 仅读取头部少量字节，不校验 CRC（计费估算不需要严格校验）。
 *
 * @param format - 图片格式（png/jpeg/jpg/gif/webp）
 * @param buf - base64 解码后的图片二进制
 * @returns { width, height } 或 null
 */
function parseImageHeader(format: string, buf: Buffer): { width: number; height: number } | null {
  switch (format) {
    case 'png':
      return parsePngDimensions(buf);
    case 'jpeg':
    case 'jpg':
      return parseJpegDimensions(buf);
    case 'gif':
      return parseGifDimensions(buf);
    case 'webp':
      return parseWebpDimensions(buf);
    default:
      return null;
  }
}

/**
 * PNG 宽高：固定 8 字节签名 + IHDR 块
 * 布局：signature(8) + length(4) + 'IHDR'(4) + width(4) + height(4)
 */
function parsePngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  // PNG 签名含 0x89/0x1A 等高位字节，'ascii' 解码不可靠 → 逐字节比较
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) return null;
  }
  // IHDR 块数据长度必须为 13
  if (buf.readUInt32BE(8) !== 13) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * JPEG 宽高：从 SOI(FFD8) 起顺序扫描段，定位 SOF 帧头
 * SOF 布局：marker(2) + length(2) + precision(1) + height(2) + width(2)
 */
function parseJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1]!;

    // RST/SOI/TEM 等无长度段
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    // 到达扫描数据（SOS）或图像结束（EOI）→ 未找到 SOF
    if (marker === 0xda || marker === 0xd9) return null;

    const segmentLen = buf.readUInt16BE(offset + 2);
    if (segmentLen < 2) return null;

    // SOF0-SOF15（排除 DHT=C4、JPG=C8、DAC=CC）
    const isSof = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && segmentLen >= 7) {
      return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
    }

    offset += 2 + segmentLen;
  }
  return null;
}

/**
 * GIF 宽高：6 字节签名 + 2 字节小端宽 + 2 字节小端高
 */
function parseGifDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 10) return null;
  const sig = buf.toString('ascii', 0, 6);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

/**
 * WebP 宽高：RIFF 容器 + 各 VP8 变体块
 * - VP8（有损）：3 字节帧标签 + 2 字节小端宽/高（高 2 位为缩放位，取低 14 位）
 * - VP8L（无损）：1 字节签名 0x2F + 4 字节位域（低 14 位宽-1，次 14 位高-1）
 * - VP8X（扩展）：flags+reserved(4) + 3 字节小端宽-1 + 3 字节小端高-1
 */
function parseWebpDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WEBP') return null;

  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ' && buf.length >= 23) {
    return {
      width: buf.readUInt16LE(19) & 0x3fff,
      height: buf.readUInt16LE(21) & 0x3fff,
    };
  }
  if (fourcc === 'VP8L' && buf.length >= 21) {
    const bits = buf.readUInt32LE(17);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (fourcc === 'VP8X' && buf.length >= 26) {
    return {
      width: buf.readUIntLE(20, 3) + 1,
      height: buf.readUIntLE(23, 3) + 1,
    };
  }
  return null;
}

/**
 * 估算音频时长（秒）
 *
 * 优先解析 WAV 头：data 块字节数 / byteRate；
 * 解析失败按 base64 字节数 / 假定码率（32000 B/s）估算。
 *
 * @param data - base64 音频数据（可能带 data:audio 前缀）
 * @returns 时长（秒），非法输入返回 0
 */
function estimateAudioSeconds(data: string): number {
  if (!data) return 0;

  // 兼容带 data URL 前缀的写法
  const base64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;

  // 优先解析 WAV 头（44 字节标准头）
  try {
    const buf = Buffer.from(base64, 'base64');
    if (buf.length >= 44
      && buf.toString('ascii', 0, 4) === 'RIFF'
      && buf.toString('ascii', 8, 12) === 'WAVE') {
      const byteRate = buf.readUInt32LE(28);
      const dataSize = buf.readUInt32LE(40);
      if (byteRate > 0 && dataSize > 0) {
        return dataSize / byteRate;
      }
    }
  } catch {
    /* 头解析失败 → 走码率估算 */
  }

  // 简化估算：字节数 / 假定码率（16kHz 16bit mono PCM ≈ 32000 B/s）
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes <= 0) return 0;
  return bytes / DEFAULT_AUDIO_BYTES_PER_SECOND;
}

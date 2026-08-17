/**
 * Preprocess multimodal request bodies:
 * - Detects base64 images/audio/video > 10MB
 * - Uploads large base64 content to temp storage (see temp-asset-store.ts)
 * - Returns processed body with internal URLs replacing large base64 content
 *
 * P0-4 说明（docs/iteration-plan-v2.md）：本模块此前只检测并打日志（Gate 5 未生效），
 * P0-4 起真正执行"大 base64 → 临时文件 + 内网 URL"替换，并挂载到多模态网关路径
 * （chat / messages / responses / anthropic）。
 *
 * @module services/upstream
 * @see docs/iteration-plan-v2.md P0-4 多模态预处理挂载
 */

import { storeTempAsset, getAssetBaseUrl } from './temp-asset-store';

interface MultimodalContent {
  type: 'image_url' | 'image' | 'audio' | 'video';
  data?: string;        // base64 data
  url?: string;          // URL reference
  mimeType?: string;
}

interface ProcessedMessage {
  role: string;
  content: string | MultimodalContent[];
  [key: string]: unknown;
}

interface ProcessedBody {
  model: string;
  messages: ProcessedMessage[];
  [key: string]: unknown;
}

export const LARGE_BASE64_THRESHOLD = 10 * 1024 * 1024; // 10MB

/**
 * Check if a string is base64 encoded data
 */
function isBase64Data(value: string): boolean {
  return /^data:([a-zA-Z0-9/+.-]+);base64,/.test(value);
}

/**
 * Estimate the size of base64-decoded data in bytes
 */
export function estimateDecodedSize(base64String: string): number {
  // Remove MIME prefix
  const data = base64String.includes(',') ? base64String.split(',')[1]! : base64String;
  // Base64: 4 chars ≈ 3 bytes
  return Math.ceil((data.length * 3) / 4);
}

/**
 * Check if content has large base64 data that should be extracted
 */
function hasLargeBase64(content: unknown): boolean {
  if (typeof content === 'string') {
    if (isBase64Data(content)) {
      return estimateDecodedSize(content) > LARGE_BASE64_THRESHOLD;
    }
    return false;
  }

  if (Array.isArray(content)) {
    return content.some((item: unknown) => {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        // Check image_url, image, audio, video fields
        for (const key of ['image_url', 'image', 'audio', 'video', 'data']) {
          const val = obj[key];
          if (typeof val === 'string' && isBase64Data(val)) {
            return estimateDecodedSize(val) > LARGE_BASE64_THRESHOLD;
          }
          if (typeof val === 'object' && val !== null) {
            const nested = val as Record<string, unknown>;
            if (typeof nested.url === 'string' && isBase64Data(nested.url)) {
              return estimateDecodedSize(nested.url) > LARGE_BASE64_THRESHOLD;
            }
          }
        }
      }
      return false;
    });
  }

  return false;
}

/**
 * 处理大 base64：解码后 > 阈值 → 上传临时文件并替换为内网 URL；
 * 小 base64 / 非 base64 → 原样返回（零开销）。
 *
 * 上传失败（磁盘/权限等）→ fail-open 原样保留 base64（不阻断请求，与
 * lib/redis.ts 降级语义一致），仅打日志。
 */
async function processLargeBase64(value: string): Promise<string> {
  if (estimateDecodedSize(value) > LARGE_BASE64_THRESHOLD) {
    try {
      const url = await storeTempAsset(value);
      console.info(
        `[Multimodal] Large base64 (${estimateDecodedSize(value)} bytes) uploaded to temp asset: ${url}`,
      );
      return url;
    } catch (err) {
      console.error('[Multimodal] temp asset upload failed, keep base64 in place:', err);
      return value;
    }
  }
  return value;
}

/**
 * Preprocess a request body for multimodal content
 * Recursively walks messages array and handles base64 in content
 * （async：大 base64 需落盘；小 base64 原样返回）
 */
export async function preprocessRequestBody(body: Record<string, unknown>): Promise<ProcessedBody> {
  if (!body.messages || !Array.isArray(body.messages)) {
    return body as ProcessedBody;
  }

  const processed: ProcessedBody = {
    ...(body as ProcessedBody),
    messages: await Promise.all(
      (body.messages as ProcessedMessage[]).map(async (msg) => {
        if (typeof msg.content === 'string') {
          return { ...msg, content: await processLargeBase64(msg.content) };
        }

        if (Array.isArray(msg.content)) {
          return {
            ...msg,
            content: await Promise.all(
              (msg.content as MultimodalContent[]).map(async (item) => {
                // Handle image_url with base64（OpenAI 多模态结构：{ type: 'image_url', image_url: { url } }）
                if (item.type === 'image_url' && typeof item === 'object') {
                  const imageUrlObj = (item as unknown as Record<string, unknown>).image_url;
                  if (typeof imageUrlObj === 'object' && imageUrlObj !== null) {
                    const url = (imageUrlObj as Record<string, unknown>).url;
                    if (typeof url === 'string' && isBase64Data(url)) {
                      return {
                        ...item,
                        image_url: { ...imageUrlObj, url: await processLargeBase64(url) },
                      };
                    }
                  }
                }

                // Handle direct base64 data
                for (const key of ['data', 'image', 'audio', 'video'] as const) {
                  const val = (item as unknown as Record<string, unknown>)[key];
                  if (typeof val === 'string' && isBase64Data(val)) {
                    return { ...item, [key]: await processLargeBase64(val) };
                  }
                }

                return item;
              }),
            ),
          };
        }

        return msg;
      }),
    ),
  };

  return processed;
}

/**
 * Check if body has large multimodal content that needs preprocessing
 */
export function needsPreprocessing(body: Record<string, unknown>): boolean {
  if (!body.messages || !Array.isArray(body.messages)) return false;

  return (body.messages as ProcessedMessage[]).some((msg) => {
    if (typeof msg.content === 'string') return hasLargeBase64(msg.content);
    if (Array.isArray(msg.content)) return hasLargeBase64(msg.content);
    return false;
  });
}

export { getAssetBaseUrl };

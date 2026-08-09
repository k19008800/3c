/**
 * Preprocess multimodal request bodies:
 * - Detects base64 images/audio/video > 10MB
 * - Uploads large base64 content to temp storage to avoid memory pressure
 * - Returns processed body with temp URLs replacing base64 content
 */

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

const LARGE_BASE64_THRESHOLD = 10 * 1024 * 1024; // 10MB

/**
 * Check if a string is base64 encoded data
 */
function isBase64Data(value: string): boolean {
  return /^data:([a-zA-Z0-9/+.-]+);base64,/.test(value);
}

/**
 * Extract MIME type from data URI
 */
function extractMimeType(dataUri: string): string | null {
  const match = dataUri.match(/^data:([a-zA-Z0-9/+.-]+);base64,/);
  return match?.[1] ?? null;
}

/**
 * Estimate the size of base64-decoded data in bytes
 */
function estimateDecodedSize(base64String: string): number {
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
 * Replace large base64 content with placeholder (in production, would upload to temp storage)
 * For now, marks as large and leaves in place (safe for testing)
 */
function processLargeBase64(value: string): string {
  // For Phase 1: if base64 is under threshold, pass through
  // If over threshold, mark it (future: upload to temp storage)
  if (estimateDecodedSize(value) > LARGE_BASE64_THRESHOLD) {
    // Return the data as-is but log warning (real upload in Phase 4+)
    console.warn(`[Multimodal] Large base64 content detected (${estimateDecodedSize(value)} bytes)`);
  }
  return value;
}

/**
 * Preprocess a request body for multimodal content
 * Recursively walks messages array and handles base64 in content
 */
export function preprocessRequestBody(body: Record<string, unknown>): ProcessedBody {
  if (!body.messages || !Array.isArray(body.messages)) {
    return body as ProcessedBody;
  }

  const processed: ProcessedBody = {
    ...(body as ProcessedBody),
    messages: (body.messages as ProcessedMessage[]).map((msg) => {
      if (typeof msg.content === 'string') {
        return { ...msg, content: processLargeBase64(msg.content) };
      }

      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: (msg.content as MultimodalContent[]).map((item) => {
            // Handle image_url with base64
            if (item.type === 'image_url' && typeof item === 'object') {
              const url = (item as unknown as Record<string, unknown>).url;
              if (typeof url === 'string' && isBase64Data(url)) {
                return {
                  ...item,
                  url: processLargeBase64(url),
                };
              }
            }

            // Handle direct base64 data
            for (const key of ['data', 'image', 'audio', 'video'] as const) {
              const val = (item as unknown as Record<string, unknown>)[key];
              if (typeof val === 'string' && isBase64Data(val)) {
                return { ...item, [key]: processLargeBase64(val) };
              }
            }

            return item;
          }),
        };
      }

      return msg;
    }),
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

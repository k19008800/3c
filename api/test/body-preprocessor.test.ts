import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import {
  preprocessRequestBody,
  needsPreprocessing,
  LARGE_BASE64_THRESHOLD,
} from '../src/services/upstream/body-preprocessor';
import { resolveAssetPath } from '../src/services/upstream/temp-asset-store';

// 测试用独立临时目录（P0-4 起大 base64 真正落盘，避免污染工作区 tmp）
const TEST_TMP_DIR = path.resolve(process.cwd(), 'tmp', 'test-multimodal');

afterEach(async () => {
  process.env.MULTIMODAL_TMP_DIR = undefined;
  try { await rm(TEST_TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Helper to create a small base64 image (under 10MB)
const SMALL_BASE64 = `data:image/png;base64,iVBORw0KGgo=`;

// Helper to create a string that looks like a large base64 (>10MB when decoded)
function largeBase64Image(): string {
  // ~10MB of base64 data
  const chunk = 'A'.repeat(1024 * 1024 * 4); // 4MB of 'A's = ~3MB decoded, so 4 chunks ≈ 12MB
  return `data:image/png;base64,${chunk.repeat(4)}`;
}

describe('Multimodal Body Preprocessor', () => {
  it('small image (< 10MB) base64 passes through unchanged', async () => {
    const body = {
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'describe this image' },
          { type: 'image_url', image_url: { url: SMALL_BASE64 } },
        ],
      }],
    };

    const result = await preprocessRequestBody(body);
    expect(needsPreprocessing(body)).toBe(false);

    const msg = result.messages[0]!;
    expect(Array.isArray(msg.content)).toBe(true);
    if (Array.isArray(msg.content)) {
      const img = msg.content[1] as any;
      expect(img.image_url.url).toBe(SMALL_BASE64);
    }
  });

  it('detects large base64 image (> 10MB)', () => {
    const body = {
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: largeBase64Image() } },
        ],
      }],
    };

    expect(needsPreprocessing(body)).toBe(true);
  });

  it('large base64 is replaced with internal temp asset URL (P0-4)', async () => {
    process.env.MULTIMODAL_TMP_DIR = TEST_TMP_DIR;
    const body = {
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: largeBase64Image() } },
        ],
      }],
    };

    const result = await preprocessRequestBody(body);
    const msg = result.messages[0]!;
    expect(Array.isArray(msg.content)).toBe(true);
    if (Array.isArray(msg.content)) {
      const img = msg.content[0] as any;
      // 大 base64 → 内网 URL（/internal/assets/<uuid>.png）
      expect(img.image_url.url).toMatch(/^\/internal\/assets\/[0-9a-f-]{36}\.png$/);
      // 临时文件真实落盘且可读取
      const fileName = img.image_url.url.split('/').pop()!;
      const fullPath = resolveAssetPath(fileName);
      expect(fullPath).not.toBeNull();
      if (fullPath) {
        const { stat } = await import('node:fs/promises');
        const st = await stat(fullPath);
        expect(st.size).toBeGreaterThan(LARGE_BASE64_THRESHOLD);
      }
    }
  });

  it('string content is processed', async () => {
    const body = {
      model: 'claude-3',
      messages: [{ role: 'user', content: SMALL_BASE64 }],
    };

    expect(needsPreprocessing(body)).toBe(false);
    const result = await preprocessRequestBody(body);
    expect(result.messages[0]!.content).toBe(SMALL_BASE64);
  });

  it('non-base64 string content passes through', async () => {
    const body = {
      model: 'claude-3',
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
    };

    expect(needsPreprocessing(body)).toBe(false);
    const result = await preprocessRequestBody(body);
    expect(result.messages[0]!.content).toBe('Hello, how are you?');
  });

  it('no messages array → returns body as-is', async () => {
    const body = { model: 'test' };
    const result = await preprocessRequestBody(body);
    expect(result).toEqual(body);
  });

  it('handles empty messages array', async () => {
    const body = { model: 'test', messages: [] };
    const result = await preprocessRequestBody(body);
    expect(result.messages).toEqual([]);
  });
});

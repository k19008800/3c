import { describe, it, expect } from 'vitest';
import { preprocessRequestBody, needsPreprocessing } from '../src/services/upstream/body-preprocessor';

// Helper to create a small base64 image (under 10MB)
const SMALL_BASE64 = `data:image/png;base64,iVBORw0KGgo=`;

// Helper to create a string that looks like a large base64 (>10MB when decoded)
function largeBase64Image(): string {
  // ~10MB of base64 data
  const chunk = 'A'.repeat(1024 * 1024 * 4); // 4MB of 'A's = ~3MB decoded, so 4 chunks ≈ 12MB
  return `data:image/png;base64,${chunk.repeat(4)}`;
}

describe('Multimodal Body Preprocessor', () => {
  it('small image (< 10MB) base64 passes through unchanged', () => {
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

    const result = preprocessRequestBody(body);
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

  it('large base64 is processed without throwing', () => {
    const body = {
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: largeBase64Image() } },
        ],
      }],
    };

    // Should not throw
    const result = preprocessRequestBody(body);
    const msg = result.messages[0]!;
    expect(Array.isArray(msg.content)).toBe(true);
  });

  it('string content is processed', () => {
    const body = {
      model: 'claude-3',
      messages: [{ role: 'user', content: SMALL_BASE64 }],
    };

    expect(needsPreprocessing(body)).toBe(false);
    const result = preprocessRequestBody(body);
    expect(result.messages[0]!.content).toBe(SMALL_BASE64);
  });

  it('non-base64 string content passes through', () => {
    const body = {
      model: 'claude-3',
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
    };

    expect(needsPreprocessing(body)).toBe(false);
    const result = preprocessRequestBody(body);
    expect(result.messages[0]!.content).toBe('Hello, how are you?');
  });

  it('no messages array → returns body as-is', () => {
    const body = { model: 'test' };
    const result = preprocessRequestBody(body);
    expect(result).toEqual(body);
  });

  it('handles empty messages array', () => {
    const body = { model: 'test', messages: [] };
    const result = preprocessRequestBody(body);
    expect(result.messages).toEqual([]);
  });
});

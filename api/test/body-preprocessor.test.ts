/**
 * 多模态请求体预处理测试（Phase 1.6 — Gate 5）
 *
 * 覆盖 6 个 case：
 * 1. 小图片 → < 10MB 的 base64 原样转发
 * 2. 大图片 → > 10MB 的 base64 上传临时文件，替换为内网 URL
 * 3. 混合 content → 同时有 text + image_url，只处理 image 部分
 * 4. 音频 → base64 音频（input_audio）同理处理
 * 5. 无 base64 → 纯文本请求不触发预处理
 * 6. 临时文件 TTL → 验证 tempFiles 列表正确，cleanupTempFiles() 可清理
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  preprocessRequestBody,
  cleanupTempFiles,
  cleanupExpiredFiles,
} from '../src/services/upstream/body-preprocessor';
import type { PreprocessOptions } from '../src/services/upstream/body-preprocessor';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** 生成一个合法的 base64 data URI（给定二进制大小上限） */
function makeDataUri(
  binarySize: number,
  mime = 'image/png',
): string {
  // base64 编码长度 ≈ ceil(binarySize * 4 / 3)
  const base64Len = Math.ceil((binarySize * 4) / 3);
  // 用 'A' 填充（'A' 是有效的 base64 字符）
  const base64Payload = 'A'.repeat(base64Len);
  return `data:${mime};base64,${base64Payload}`;
}

/** 用于测试的小阈值配置（100 字节） */
const LOW_THRESHOLD: PreprocessOptions = {
  maxInlineBytes: 100,
  tempBaseDir: '/tmp/test-multimodal',
  internalUrlPrefix: 'http://localhost:3000/internal/tmp',
};

// mock fs/promises
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('multimodal body-preprocessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Case 1: 小图片 ──────────────────────────────────────────────
  describe('小图片 → < 阈值 base64 原样转发', () => {
    it('小于阈值的 base64 image_url 原样保留，hasLargeMedia=false', async () => {
      const smallB64 = makeDataUri(50, 'image/png'); // 50 bytes < 100

      const body = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '描述这张图' },
              {
                type: 'image_url',
                image_url: { url: smallB64, detail: 'high' },
              },
            ],
          },
        ],
      };

      const result = await preprocessRequestBody(
        body,
        'req-001',
        LOW_THRESHOLD,
      );

      expect(result.hasLargeMedia).toBe(false);
      expect(result.tempFiles).toHaveLength(0);
      // body 原样保留（detail 字段也在）
      const msg = (result.body as any).messages[0];
      const imgPart = msg.content[1];
      expect(imgPart.type).toBe('image_url');
      expect(imgPart.image_url.url).toBe(smallB64);
      expect(imgPart.image_url.detail).toBe('high');
    });

    it('默认 10MB 阈值下小图片原样保留', async () => {
      const smallB64 = makeDataUri(1024, 'image/jpeg'); // 1KB

      const body = {
        messages: [{
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: smallB64 } }],
        }],
      };

      // 使用默认阈值（10MB）
      const result = await preprocessRequestBody(body);

      expect(result.hasLargeMedia).toBe(false);
      expect(result.tempFiles).toHaveLength(0);
      const msg = (result.body as any).messages[0];
      expect(msg.content[0].image_url.url).toBe(smallB64);
    });
  });

  // ── Case 2: 大图片 ──────────────────────────────────────────────
  describe('大图片 → > 阈值 base64 上传临时文件，替换为内网 URL', () => {
    it('超过阈值的 base64 image_url 写入临时文件并替换为内网 URL', async () => {
      const { writeFile, mkdir } = await import('node:fs/promises');
      const largeB64 = makeDataUri(200, 'image/png'); // 200 bytes > 100

      const body = {
        messages: [{
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: largeB64 } }],
        }],
      };

      const result = await preprocessRequestBody(
        body,
        'req-002',
        LOW_THRESHOLD,
      );

      // 标记有大媒体
      expect(result.hasLargeMedia).toBe(true);
      // 创建了一个临时目录
      expect(mkdir).toHaveBeenCalled();
      // 写入文件
      expect(writeFile).toHaveBeenCalledTimes(1);
      // tempFiles 列表非空
      expect(result.tempFiles).toHaveLength(1);
      // 跨平台路径：Windows 用 \，POSIX 用 /
      expect(result.tempFiles[0]).toMatch(/test-multimodal[/\\]req-002[/\\].+\.png$/);

      // body 中 url 被替换为内网 URL
      const msg = (result.body as any).messages[0];
      const imgUrl: string = msg.content[0].image_url.url;
      expect(imgUrl).toMatch(/^http:\/\/localhost:3000\/internal\/tmp\/req-002\/.+\.png$/);
      expect(imgUrl).not.toContain('data:');
    });

    it('一个请求中的多个大图片各自生成独立临时文件', async () => {
      const { writeFile } = await import('node:fs/promises');
      const largeB64_1 = makeDataUri(200, 'image/png');
      const largeB64_2 = makeDataUri(150, 'image/gif');

      const body = {
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: largeB64_1 } },
            { type: 'image_url', image_url: { url: largeB64_2 } },
          ],
        }],
      };

      const result = await preprocessRequestBody(
        body,
        'req-multi',
        LOW_THRESHOLD,
      );

      expect(result.hasLargeMedia).toBe(true);
      expect(writeFile).toHaveBeenCalledTimes(2);
      expect(result.tempFiles).toHaveLength(2);
      expect(result.tempFiles[0]).not.toBe(result.tempFiles[1]);
    });
  });

  // ── Case 3: 混合 content ────────────────────────────────────────
  describe('混合 content → text + image_url 只处理 image 部分', () => {
    it('text 部分保持不变，image_url 大图片被替换', async () => {
      const largeB64 = makeDataUri(200, 'image/png');
      const textContent = '请分析这张图片的内容';

      const body = {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: textContent },
            { type: 'image_url', image_url: { url: largeB64 } },
          ],
        }],
      };

      const result = await preprocessRequestBody(
        body,
        'req-003',
        LOW_THRESHOLD,
      );

      const msg = (result.body as any).messages[0];
      // text 不变
      expect(msg.content[0].type).toBe('text');
      expect(msg.content[0].text).toBe(textContent);
      // image_url 被替换
      expect(msg.content[1].type).toBe('image_url');
      expect(msg.content[1].image_url.url).toMatch(/^http:\/\/localhost/);

      expect(result.hasLargeMedia).toBe(true);
      expect(result.tempFiles).toHaveLength(1);
    });

    it('混合 content 中小图片 + text → image 不变，text 不变', async () => {
      const smallB64 = makeDataUri(50, 'image/png');

      const body = {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'image_url', image_url: { url: smallB64 } },
          ],
        }],
      };

      const result = await preprocessRequestBody(
        body,
        'req-003b',
        LOW_THRESHOLD,
      );

      const msg = (result.body as any).messages[0];
      expect(msg.content[0].text).toBe('hello');
      expect(msg.content[1].image_url.url).toBe(smallB64);
      expect(result.hasLargeMedia).toBe(false);
    });

    it('messages 中多条消息，仅含大图片的消息被处理', async () => {
      const largeB64 = makeDataUri(200, 'image/png');
      const smallB64 = makeDataUri(50, 'image/png');

      const body = {
        messages: [
          { role: 'system', content: 'You are helpful.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: '第一张' },
              { type: 'image_url', image_url: { url: largeB64 } },
            ],
          },
          {
            role: 'assistant',
            content: 'I see the image.',
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: smallB64 } },
            ],
          },
        ],
      };

      const result = await preprocessRequestBody(
        body,
        'req-003c',
        LOW_THRESHOLD,
      );

      const msgs = (result.body as any).messages;
      // system 消息不变
      expect(msgs[0].content).toBe('You are helpful.');
      // 第一条 user 消息中 image 被替换
      expect(msgs[1].content[1].image_url.url).toMatch(/^http:\/\/localhost/);
      // assistant 消息不变
      expect(msgs[2].content).toBe('I see the image.');
      // 第二条 user 消息中小图片不变
      expect(msgs[3].content[0].image_url.url).toBe(smallB64);

      expect(result.hasLargeMedia).toBe(true);
      expect(result.tempFiles).toHaveLength(1);
    });
  });

  // ── Case 4: 音频 ────────────────────────────────────────────────
  describe('音频 → base64 音频（input_audio）同理处理', () => {
    it('小音频 < 阈值 → 原样保留', async () => {
      const smallAudio = makeDataUri(50, 'audio/wav');

      const body = {
        messages: [{
          role: 'user',
          content: [{ type: 'input_audio', input_audio: { data: smallAudio, format: 'wav' } }],
        }],
      };

      const result = await preprocessRequestBody(
        body,
        'req-004a',
        LOW_THRESHOLD,
      );

      expect(result.hasLargeMedia).toBe(false);
      const msg = (result.body as any).messages[0];
      expect(msg.content[0].input_audio.data).toBe(smallAudio);
      expect(msg.content[0].input_audio.format).toBe('wav');
    });

    it('大音频 > 阈值 → 写入临时文件，替换为内网 URL', async () => {
      const { writeFile } = await import('node:fs/promises');
      const largeAudio = makeDataUri(200, 'audio/mp3');

      const body = {
        messages: [{
          role: 'user',
          content: [{ type: 'input_audio', input_audio: { data: largeAudio, format: 'mp3' } }],
        }],
      };

      const result = await preprocessRequestBody(
        body,
        'req-004b',
        LOW_THRESHOLD,
      );

      expect(result.hasLargeMedia).toBe(true);
      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(result.tempFiles).toHaveLength(1);

      const msg = (result.body as any).messages[0];
      const audioUrl = msg.content[0].input_audio.data;
      expect(audioUrl).toMatch(/^http:\/\/localhost:3000\/internal\/tmp\/req-004b\/.+\.mp3$/);
      expect(msg.content[0].input_audio.format).toBe('mp3');
    });

    it('混合：大音频 + 大图片 → 两个都被替换', async () => {
      const { writeFile } = await import('node:fs/promises');
      const largeAudio = makeDataUri(200, 'audio/ogg');
      const largeImage = makeDataUri(200, 'image/png');

      const body = {
        messages: [{
          role: 'user',
          content: [
            { type: 'input_audio', input_audio: { data: largeAudio, format: 'ogg' } },
            { type: 'image_url', image_url: { url: largeImage } },
          ],
        }],
      };

      const result = await preprocessRequestBody(
        body,
        'req-004c',
        LOW_THRESHOLD,
      );

      expect(result.hasLargeMedia).toBe(true);
      expect(writeFile).toHaveBeenCalledTimes(2);
      expect(result.tempFiles).toHaveLength(2);

      const msg = (result.body as any).messages[0];
      expect(msg.content[0].input_audio.data).toMatch(/^http:\/\/localhost/);
      expect(msg.content[1].image_url.url).toMatch(/^http:\/\/localhost/);
    });
  });

  // ── Case 5: 无 base64 ───────────────────────────────────────────
  describe('无 base64 → 纯文本请求不触发预处理', () => {
    it('普通纯文本消息 → 原样返回', async () => {
      const body = {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
        temperature: 0.7,
      };

      const result = await preprocessRequestBody(
        body,
        'req-005',
        LOW_THRESHOLD,
      );

      expect(result.hasLargeMedia).toBe(false);
      expect(result.tempFiles).toHaveLength(0);
      // body 完全不变
      expect(result.body).toEqual(body);
    });

    it('纯 URL 图片（非 base64）→ 不触发处理', async () => {
      const body = {
        messages: [{
          role: 'user',
          content: [{
            type: 'image_url',
            image_url: { url: 'https://example.com/photo.png' },
          }],
        }],
      };

      const result = await preprocessRequestBody(
        body,
        'req-005b',
        LOW_THRESHOLD,
      );

      expect(result.hasLargeMedia).toBe(false);
      expect(result.tempFiles).toHaveLength(0);
      const msg = (result.body as any).messages[0];
      expect(msg.content[0].image_url.url).toBe('https://example.com/photo.png');
    });

    it('空 body → 原样返回', async () => {
      const body: Record<string, unknown> = {};

      const result = await preprocessRequestBody(body);

      expect(result.hasLargeMedia).toBe(false);
      expect(result.tempFiles).toHaveLength(0);
      expect(result.body).toEqual({});
    });

    it('非 data URI 前缀的字符串不触发处理', async () => {
      const body = {
        messages: [{
          role: 'user',
          content: [{
            type: 'image_url',
            image_url: { url: 'file:///local/image.png' },
          }],
        }],
      };

      const result = await preprocessRequestBody(body, 'req-005c', LOW_THRESHOLD);

      expect(result.hasLargeMedia).toBe(false);
      const msg = (result.body as any).messages[0];
      expect(msg.content[0].image_url.url).toBe('file:///local/image.png');
    });
  });

  // ── Case 6: 临时文件 TTL ───────────────────────────────────────
  describe('临时文件 TTL → tempFiles 列表正确，cleanupTempFiles() 可清理', () => {
    it('大图片处理后 tempFiles 包含正确路径', async () => {
      const largeB64 = makeDataUri(200, 'image/png');

      const body = {
        messages: [{
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: largeB64 } }],
        }],
      };

      const result = await preprocessRequestBody(
        body,
        'req-006',
        { ...LOW_THRESHOLD, tempBaseDir: '/tmp/test-multimodal' },
      );

      expect(result.tempFiles).toHaveLength(1);
      // 跨平台路径：Windows 用 \，POSIX 用 /
      expect(result.tempFiles[0]).toMatch(/test-multimodal[/\\]req-006[/\\].+\.png$/);
    });

    it('cleanupTempFiles() 为每个文件调用 rm', async () => {
      const { rm } = await import('node:fs/promises');

      const filePaths = [
        '/tmp/test-multimodal/req-a/file1.png',
        '/tmp/test-multimodal/req-a/file2.png',
      ];

      await cleanupTempFiles(filePaths);

      expect(rm).toHaveBeenCalledTimes(2);
      expect(rm).toHaveBeenCalledWith(filePaths[0], { force: true });
      expect(rm).toHaveBeenCalledWith(filePaths[1], { force: true });
    });

    it('cleanupTempFiles() 空数组不调用 rm', async () => {
      const { rm } = await import('node:fs/promises');
      await cleanupTempFiles([]);
      expect(rm).not.toHaveBeenCalled();
    });

    it('cleanupExpiredFiles() 扫描目录并删除过期条目', async () => {
      const { readdir, stat, rm } = await import('node:fs/promises');

      // mock：目录存在两个子目录
      const mockDirs = ['req-old', 'req-new'];
      (readdir as any).mockResolvedValueOnce(mockDirs);
      (stat as any)
        .mockResolvedValueOnce({ mtimeMs: Date.now() - 10 * 60 * 1000 }) // 10 分钟前 ← 过期
        .mockResolvedValueOnce({ mtimeMs: Date.now() - 1 * 60 * 1000 }); // 1 分钟前 ← 未过期

      const removed = await cleanupExpiredFiles(5 * 60 * 1000, '/tmp/test-multimodal');

      // 只删除了 req-old
      expect(removed).toBe(1);
      expect(readdir).toHaveBeenCalledWith('/tmp/test-multimodal');
      // req-old 被删除
      expect(rm).toHaveBeenCalledWith(
        expect.stringContaining('req-old'),
        { recursive: true, force: true },
      );
      // req-new 未被删除
      expect(rm).not.toHaveBeenCalledWith(
        expect.stringContaining('req-new'),
        expect.anything(),
      );
    });

    it('cleanupExpiredFiles() 目录不存在时不抛异常', async () => {
      const { readdir } = await import('node:fs/promises');
      (readdir as any).mockRejectedValueOnce(new Error('ENOENT'));

      const removed = await cleanupExpiredFiles(5 * 60 * 1000, '/nonexistent');

      expect(removed).toBe(0);
    });
  });
});

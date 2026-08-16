/**
 * 多模态 Token 估算测试 — Batch 4 任务 4.3
 *
 * 覆盖：
 * - estimateImageTokens：low / high / auto / 不同尺寸 / 2048 缩放 / 非法输入
 * - estimateAudioTokens：10s×32/s、小数时长、自定义速率、非法输入
 * - estimateMultimodalContentTokens：纯文本 / 文本+图片 / 音频 / 未知类型 / 注入 countText
 * - 回归：chat.ts estimateInputTokens 纯文本行为不变
 */

import { describe, it, expect } from 'vitest';
import {
  estimateImageTokens,
  estimateAudioTokens,
  estimateMultimodalContentTokens,
} from '../src/services/billing/multimodal-counter.js';
import { estimateInputTokens } from '../src/routes/chat.js';
import { countTokens } from '../src/services/billing/token-counter.js';

// ============================================================
// Helpers：构造可解析图片头的 base64（仅头部，解析器不校验 CRC）
// ============================================================

/**
 * 构造指定宽高的 PNG base64（签名 + IHDR 头即可，无真实像素数据）
 *
 * 布局：signature(8) + length(4) + 'IHDR'(4) + width(4) + height(4)
 */
function pngBase64(width: number, height: number): string {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  const len = Buffer.alloc(4);
  len.writeUInt32BE(13, 0);
  const type = Buffer.from('IHDR', 'ascii');
  const crc = Buffer.alloc(4); // 占位，解析器不校验
  return Buffer.concat([sig, len, type, ihdrData, crc]).toString('base64');
}

/**
 * 构造指定宽高的 JPEG base64（SOI + SOF0 + EOI，无真实像素数据）
 *
 * SOF0 布局：marker(2) + length(2) + precision(1) + height(2) + width(2) + components(1) + ...
 */
function jpegBase64(width: number, height: number): string {
  const payload = Buffer.alloc(17);
  payload[0] = 8; // precision
  payload.writeUInt16BE(height, 1);
  payload.writeUInt16BE(width, 3);
  payload[5] = 3; // components
  const len = Buffer.alloc(2);
  len.writeUInt16BE(17, 0);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xc0]), // SOF0
    len,
    payload,
    Buffer.from([0xff, 0xd9]), // EOI
  ]).toString('base64');
}

/** 构造 WAV base64（44 字节标准头） */
function wavBase64(byteRate: number, dataSize: number): string {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(16000, 24); // sample rate
  buf.writeUInt32LE(byteRate, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40); // data size
  return buf.toString('base64');
}

// ============================================================
// estimateImageTokens
// ============================================================

describe('estimateImageTokens', () => {
  it('1. low detail → 固定 85 tokens（任意尺寸）', () => {
    const r = estimateImageTokens(2048, 2048, 'low');
    expect(r.tokens).toBe(85);
    expect(r.tiles).toBe(0);
  });

  it('2. high 小图（512×512）→ base 85 + 1 tile×170 = 255', () => {
    const r = estimateImageTokens(512, 512, 'high');
    expect(r.tiles).toBe(1);
    expect(r.tokens).toBe(255);
  });

  it('3. high 1024×1024 → tiles=2，tokens=425', () => {
    const r = estimateImageTokens(1024, 1024, 'high');
    expect(r.tiles).toBe(2);
    expect(r.tokens).toBe(425);
  });

  it('4. auto 与 high 等价（默认 detail 走 high 规则）', () => {
    expect(estimateImageTokens(512, 512, 'auto')).toEqual({ tokens: 255, tiles: 1 });
    expect(estimateImageTokens(512, 512)).toEqual({ tokens: 255, tiles: 1 });
  });

  it('5. 不同尺寸 → tiles 数按长边/512 向上取整', () => {
    // 长边 100 < 512 → 1 tile
    expect(estimateImageTokens(100, 50, 'high').tiles).toBe(1);
    // 长边 1024 → ceil(1024/512) = 2
    expect(estimateImageTokens(1024, 512, 'high').tiles).toBe(2);
    // 长边 2048 → ceil(2048/512) = 4
    expect(estimateImageTokens(2048, 2048, 'high').tiles).toBe(4);
    // 竖图：长边按 height 计算
    expect(estimateImageTokens(256, 1536, 'high').tiles).toBe(3);
    expect(estimateImageTokens(256, 1536, 'high').tokens).toBe(85 + 3 * 170);
  });

  it('6. 超大图先等比缩放至 2048 再切 tile', () => {
    // 3000×1500 → 缩放至 2048×1024 → tiles = ceil(2048/512) = 4
    const r = estimateImageTokens(3000, 1500, 'high');
    expect(r.tiles).toBe(4);
    expect(r.tokens).toBe(85 + 4 * 170);
    // 5000×1000 → 缩放至 2048×410 → tiles = 4
    expect(estimateImageTokens(5000, 1000, 'high').tiles).toBe(4);
  });

  it('7. 非法尺寸（0/负数/NaN）→ 按默认 512×512 high 兜底', () => {
    expect(estimateImageTokens(0, 0, 'high')).toEqual({ tokens: 255, tiles: 1 });
    expect(estimateImageTokens(-5, 100, 'high')).toEqual({ tokens: 255, tiles: 1 });
    expect(estimateImageTokens(Number.NaN, 100, 'high')).toEqual({ tokens: 255, tiles: 1 });
  });
});

// ============================================================
// estimateAudioTokens
// ============================================================

describe('estimateAudioTokens', () => {
  it('1. 10 秒 × 32/s → 320', () => {
    expect(estimateAudioTokens(10)).toBe(320);
  });

  it('2. 小数时长向上取整（3.2s × 32 = 102.4 → 103）', () => {
    expect(estimateAudioTokens(3.2)).toBe(103);
  });

  it('3. 自定义速率生效', () => {
    expect(estimateAudioTokens(10, 16)).toBe(160);
    expect(estimateAudioTokens(1, 15)).toBe(15); // 任务背景：1 秒 ≈ 15-25 tokens 区间
  });

  it('4. 非法时长（0/负数/NaN）→ 0', () => {
    expect(estimateAudioTokens(0)).toBe(0);
    expect(estimateAudioTokens(-5)).toBe(0);
    expect(estimateAudioTokens(Number.NaN)).toBe(0);
  });
});

// ============================================================
// estimateMultimodalContentTokens
// ============================================================

describe('estimateMultimodalContentTokens', () => {
  it('1. 纯文本数组 → 只计 text（默认 chars/3 估算）', () => {
    const r = estimateMultimodalContentTokens(['hello', 'world'], 'gpt-4o');
    expect(r.breakdown).toEqual({ text: 4, images: 0, audio: 0 }); // ceil(5/3)×2
    expect(r.totalTokens).toBe(4);
  });

  it('2. 可注入 countText 回调（chat.ts 传 tiktoken）', () => {
    const r = estimateMultimodalContentTokens(['hello', 'world'], 'gpt-4o', {
      countText: (t) => t.length,
    });
    expect(r.breakdown.text).toBe(10);
    expect(r.totalTokens).toBe(10);
  });

  it('3. text + image_url 混合 → breakdown 含 images（PNG 头解析出 1024×1024 → 425）', () => {
    const content = [
      '描述图片',
      { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64(1024, 1024)}`, detail: 'high' } },
    ];
    const r = estimateMultimodalContentTokens(content, 'gpt-4o');
    expect(r.breakdown.text).toBe(2); // ceil(4/3)
    expect(r.breakdown.images).toBe(425);
    expect(r.breakdown.audio).toBe(0);
    expect(r.totalTokens).toBe(427);
  });

  it('4. JPEG 头解析出宽高（640×480 → 425）', () => {
    const r = estimateMultimodalContentTokens(
      [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64(640, 480)}` } }],
      'gpt-4o',
    );
    expect(r.breakdown.images).toBe(425);
  });

  it('5. image_url detail=low → 只计 85（不解析尺寸）', () => {
    const r = estimateMultimodalContentTokens(
      [{ type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64(1024, 1024)}`, detail: 'low' } }],
      'gpt-4o',
    );
    expect(r.breakdown.images).toBe(85);
  });

  it('6. 无法解析头（bmp）→ base64 长度估算像素，小图仍为 1 tile → 255', () => {
    const r = estimateMultimodalContentTokens(
      [{ type: 'image_url', image_url: { url: 'data:image/bmp;base64,AAAA' } }],
      'gpt-4o',
    );
    expect(r.breakdown.images).toBe(255);
  });

  it('7. 普通 URL 图片（不发起网络请求）→ 默认 512×512 high → 255', () => {
    const r = estimateMultimodalContentTokens(
      [{ type: 'image_url', image_url: { url: 'https://example.com/photo.png' } }],
      'gpt-4o',
    );
    expect(r.breakdown.images).toBe(255);
  });

  it('8. input_audio → breakdown 含 audio（WAV 头 1s × 32/s = 32）', () => {
    const r = estimateMultimodalContentTokens(
      [{ type: 'input_audio', input_audio: { data: wavBase64(32000, 32000), format: 'wav' } }],
      'gpt-4o',
    );
    expect(r.breakdown.audio).toBe(32);
    expect(r.breakdown.text).toBe(0);
    expect(r.totalTokens).toBe(32);
  });

  it('9. 未知类型（file 等）→ JSON.stringify 后计 token（归入 text）', () => {
    const part = { type: 'file', file: { name: 'a.pdf' } };
    const r = estimateMultimodalContentTokens([part], 'gpt-4o');
    const jsonLen = JSON.stringify(part).length; // 38
    expect(r.breakdown.text).toBe(Math.ceil(jsonLen / 3));
    expect(r.totalTokens).toBe(Math.ceil(jsonLen / 3));
  });

  it('10. { type:"text" } 显式文本块 → 计 text', () => {
    const r = estimateMultimodalContentTokens([{ type: 'text', text: 'hello' }], 'gpt-4o');
    expect(r.breakdown.text).toBe(2); // ceil(5/3)
    expect(r.totalTokens).toBe(2);
  });

  it('11. 非数组入参（防御性）→ 不抛错，按 JSON 序列化计 token', () => {
    const r = estimateMultimodalContentTokens('hello' as unknown as unknown[], 'gpt-4o');
    expect(r.totalTokens).toBe(Math.ceil(JSON.stringify('hello').length / 3));
  });
});

// ============================================================
// 回归：chat.ts estimateInputTokens 纯文本行为不变
// ============================================================

describe('estimateInputTokens 回归（chat.ts）', () => {
  it('1. 纯文本 content（string）→ 与旧实现（逐条 tiktoken + 每条 4 token）一致', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, how are you?' },
      { role: 'user', content: '你好世界' },
    ];
    const expected = messages.reduce(
      (sum, m) => sum + countTokens(m.content as string, 'gpt-4o'),
      0,
    ) + messages.length * 4;

    expect(estimateInputTokens(messages as any, 'gpt-4o')).toBe(expected);
  });

  it('2. 纯文本数组 content（全 string）→ 与旧实现逐段 tiktoken 一致', () => {
    const messages = [{ role: 'user', content: ['part one', 'part two'] }];
    const expected = countTokens('part one', 'gpt-4o') + countTokens('part two', 'gpt-4o') + 4;

    expect(estimateInputTokens(messages as any, 'gpt-4o')).toBe(expected);
  });

  it('3. 含 image_url 的多模态 content → 图片按多模态规则计 token', () => {
    const messages = [{
      role: 'user',
      content: [
        '看图',
        { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64(512, 512)}`, detail: 'high' } },
      ],
    }];
    // 512×512 high = 255（base 85 + 1 tile×170）
    const expected = countTokens('看图', 'gpt-4o') + 255 + 4;

    expect(estimateInputTokens(messages as any, 'gpt-4o')).toBe(expected);
  });

  it('4. 含 input_audio 的多模态 content → 音频按时长计 token', () => {
    const messages = [{
      role: 'user',
      content: [
        '转写这段音频',
        { type: 'input_audio', input_audio: { data: wavBase64(32000, 32000), format: 'wav' } },
      ],
    }];
    // 1s × 32/s = 32
    const expected = countTokens('转写这段音频', 'gpt-4o') + 32 + 4;

    expect(estimateInputTokens(messages as any, 'gpt-4o')).toBe(expected);
  });

  it('5. msg.tool_calls → JSON 序列化后计入输入 token', () => {
    const messages = [
      { role: 'user', content: '查一下北京的天气' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Beijing"}' },
        }],
      },
    ];
    const expected = countTokens('查一下北京的天气', 'gpt-4o')
      + countTokens(JSON.stringify(messages[1]!.tool_calls), 'gpt-4o')
      + messages.length * 4;

    expect(estimateInputTokens(messages as any, 'gpt-4o')).toBe(expected);
  });
});

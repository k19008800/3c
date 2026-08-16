/**
 * API 域名配置测试 — buildApiConfig / normalizeOrigin
 *
 * 覆盖：默认值、域名 → https、完整 origin 保留、尾部斜杠清理、双 base_url 派生契约
 */

import { describe, it, expect } from 'vitest';
import { buildApiConfig, normalizeOrigin, DEFAULT_API_DOMAIN } from '../src/services/config/api-domain.js';

describe('normalizeOrigin', () => {
  it('1. 空值回退默认域名', () => {
    expect(normalizeOrigin(null)).toBe(`https://${DEFAULT_API_DOMAIN}`);
    expect(normalizeOrigin('')).toBe(`https://${DEFAULT_API_DOMAIN}`);
    expect(normalizeOrigin('   ')).toBe(`https://${DEFAULT_API_DOMAIN}`);
  });

  it('2. 域名 → https:// 前缀', () => {
    expect(normalizeOrigin('api.unmisa.com')).toBe('https://api.unmisa.com');
  });

  it('3. 完整 origin 保留协议（含本地开发 http://localhost:3000）', () => {
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeOrigin('https://api.example.com')).toBe('https://api.example.com');
  });

  it('4. 尾部斜杠清理', () => {
    expect(normalizeOrigin('api.unmisa.com/')).toBe('https://api.unmisa.com');
    expect(normalizeOrigin('http://localhost:3000//')).toBe('http://localhost:3000');
  });
});

describe('buildApiConfig', () => {
  it('5. 默认域名派生双 base_url（对齐 DeepSeek 契约）', () => {
    const c = buildApiConfig();
    expect(c.apiDomain).toBe(DEFAULT_API_DOMAIN);
    // OpenAI SDK base_url 含 /v1（SDK 自行拼接 /chat/completions）
    expect(c.openaiBaseUrl).toBe('https://api.unmisa.com/v1');
    // Anthropic SDK base_url（SDK 自行拼接 /v1/messages）
    expect(c.anthropicBaseUrl).toBe('https://api.unmisa.com/anthropic');
    expect(c.openaiChatUrl).toBe('https://api.unmisa.com/v1/chat/completions');
    expect(c.anthropicMessagesUrl).toBe('https://api.unmisa.com/anthropic/v1/messages');
  });

  it('6. 自定义域名派生', () => {
    const c = buildApiConfig('gateway.mycloud.cn');
    expect(c.apiDomain).toBe('gateway.mycloud.cn');
    expect(c.openaiBaseUrl).toBe('https://gateway.mycloud.cn/v1');
    expect(c.anthropicBaseUrl).toBe('https://gateway.mycloud.cn/anthropic');
  });

  it('7. 本地开发 origin 派生（http 保留）', () => {
    const c = buildApiConfig('http://localhost:3000');
    expect(c.openaiBaseUrl).toBe('http://localhost:3000/v1');
    expect(c.anthropicBaseUrl).toBe('http://localhost:3000/anthropic');
  });
});

/**
 * lib/i18n-langs 单元测试（Gate-1 集中白名单 / scope 解析纯函数）
 *
 * 覆盖（产物契约，见 docs/多语言i18n改造方案.md §2.3 / §2.4）：
 *   - normalizeI18nLang：8 语言规范形、大小写 / 下划线 / 连字符归一番
 *   - 非法输入（null/''/fr/fr-FR/超长/未知）→ null
 *   - parseI18nScopes：缺省回退 portal、逗号分隔 / 重复 query、去重、动态 scope 默认排除
 *
 * 无外部依赖（纯函数），可独立运行。
 * @see docs/多语言i18n改造方案.md §2.1 / §2.3
 * @module lib/i18n-langs.test
 */
import { describe, it, expect } from 'vitest';
import {
  I18N_LANGS,
  parseI18nScopes,
  normalizeI18nLang,
} from './i18n-langs.js';

describe('normalizeI18nLang — 8 语言规范形', () => {
  it('zh 方言 → zh-CN', () => {
    expect(I18N_LANGS).toContain('zh-CN');
    expect(normalizeI18nLang('zh-CN')).toBe('zh-CN');
    expect(normalizeI18nLang('zh_cn')).toBe('zh-CN');
    expect(normalizeI18nLang('ZH-CN')).toBe('zh-CN');
    expect(normalizeI18nLang('Zh_CN')).toBe('zh-CN');
  });

  it('en 方言 → en（en_us 归一为 en）', () => {
    expect(normalizeI18nLang('en')).toBe('en');
    expect(normalizeI18nLang('en_us')).toBe('en');
    expect(normalizeI18nLang('en-US')).toBe('en');
    expect(normalizeI18nLang('EN')).toBe('en');
  });

  it('ja 方言 → ja-JP', () => {
    expect(normalizeI18nLang('ja-JP')).toBe('ja-JP');
    expect(normalizeI18nLang('ja_jp')).toBe('ja-JP');
    expect(normalizeI18nLang('JA-JP')).toBe('ja-JP');
  });

  it('ko 方言 → ko-KR', () => {
    expect(normalizeI18nLang('ko-KR')).toBe('ko-KR');
    expect(normalizeI18nLang('ko_kr')).toBe('ko-KR');
    expect(normalizeI18nLang('KO_KR')).toBe('ko-KR');
  });

  it('vi/th/id/fil 规范形且大小写不敏感', () => {
    expect(normalizeI18nLang('vi')).toBe('vi');
    expect(normalizeI18nLang('VI')).toBe('vi');
    expect(normalizeI18nLang('th')).toBe('th');
    expect(normalizeI18nLang('TH')).toBe('th');
    expect(normalizeI18nLang('id')).toBe('id');
    expect(normalizeI18nLang('ID')).toBe('id');
    expect(normalizeI18nLang('fil')).toBe('fil');
    expect(normalizeI18nLang('FIL')).toBe('fil');
  });

  it('8 语言全量白名单可归一', () => {
    for (const l of I18N_LANGS) expect(normalizeI18nLang(l)).toBe(l);
  });
});

describe('normalizeI18nLang — 非法输入', () => {
  it('null / undefined → null', () => {
    expect(normalizeI18nLang(null)).toBeNull();
    expect(normalizeI18nLang(undefined)).toBeNull();
  });
  it('空串 / 纯空白 → null', () => {
    expect(normalizeI18nLang('')).toBeNull();
    expect(normalizeI18nLang('   ')).toBeNull();
  });
  it('非白名单语言 → null', () => {
    expect(normalizeI18nLang('fr')).toBeNull();
    expect(normalizeI18nLang('fr-FR')).toBeNull();
    expect(normalizeI18nLang('de')).toBeNull();
    expect(normalizeI18nLang('pt')).toBeNull();
  });
  it('超长输入 → null', () => {
    expect(normalizeI18nLang('zh-CN_extra')).toBeNull();
    expect(normalizeI18nLang('english')).toBeNull();
  });
  it('未知拼写 → null', () => {
    expect(normalizeI18nLang('vn')).toBeNull(); // 越南应写 vi
    expect(normalizeI18nLang('ph')).toBeNull(); // 菲律宾应写 fil
  });
});

describe('parseI18nScopes — scope 解析（向后兼容）', () => {
  it('缺省 / 空 → 回退 portal（向后兼容）', () => {
    expect(parseI18nScopes(undefined)).toEqual(['portal']);
    expect(parseI18nScopes(null)).toEqual(['portal']);
    expect(parseI18nScopes('')).toEqual(['portal']);
    expect(parseI18nScopes([])).toEqual(['portal']);
  });
  it('逗号分隔多值 → 返回并集', () => {
    expect(parseI18nScopes('console,common')).toEqual(['console', 'common']);
    expect(parseI18nScopes('portal,admin,common')).toEqual(['portal', 'admin', 'common']);
  });
  it('重复 query form（数组）→ 并集 + 去重', () => {
    expect(parseI18nScopes(['console', 'common'])).toEqual(['console', 'common']);
    expect(parseI18nScopes(['console', 'console', 'common'])).toEqual(['console', 'common']);
    expect(parseI18nScopes(['console,common', 'admin'])).toEqual(['console', 'common', 'admin']);
  });
  it('去重并保序', () => {
    expect(parseI18nScopes('common,portal,common,portal')).toEqual(['common', 'portal']);
  });
  it('动态 scope 默认排除，仅显式传入才返回', () => {
    // error/email/notification 未显式传 → 不作为默认并集（防 payload 膨胀）
    expect(parseI18nScopes(undefined)).not.toContain('error');
    // 显式传入 → 放行
    expect(parseI18nScopes('console,error')).toEqual(['console', 'error']);
    expect(parseI18nScopes('email,notification')).toEqual(['email', 'notification']);
  });
  it('未知 scope 被过滤', () => {
    expect(parseI18nScopes('console,unknown')).toEqual(['console']);
  });
});
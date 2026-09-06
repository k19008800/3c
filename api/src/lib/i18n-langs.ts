/**
 * 后端集中语言白名单 — i18n 语言归一化（Gate-0/Gate-1 核心）
 *
 * 职责：**后端唯一**的合法语言来源。杜绝"脏语言"（`zh-CN` / `zh_cn` / `en` / `en_us`
 * 分裂同一 key+lang 唯一约束、覆盖率失真）——所有写路径（admin CRUD / import）、
 * 读路径（public 词典）、用户偏好（/me/settings）一律经 `normalizeI18nLang` 归一。
 *
 * 语言集合（8 种，对齐 docs/多语言i18n改造方案.md §2.1 统一语言模型）：
 *   zh-CN / en / ja-JP / ko-KR / vi / th / id / fil
 *
 * 归一化规则（大小写不敏感）：
 *   · 移除 `-` / `_` 分隔符后再比对（zh_cn→zhcn→zh-CN、en_us→enus→en）
 *   · 仅接受白名单内的规范形；其余（null/''/fr/fr-FR/超长/未知）一律返回 null
 *
 * @see docs/多语言i18n改造方案.md §2.1 / §2.3 / §2.4（Gate-0/1）
 * @see docs/_i18n-review-synthesis-draft.md §3.3 后端 lang 无白名单 = 脏语言风险
 * @module lib/i18n-langs
 */
export const I18N_LANGS = ['zh-CN', 'en', 'ja-JP', 'ko-KR', 'vi', 'th', 'id', 'fil'] as const;
/** 合法语言联合类型（8 种规范形） */
export type I18nLang = (typeof I18N_LANGS)[number];

/**
 * 静态 scope（随页面全量拉取）：portal / console / common / admin
 * 见 docs/多语言i18n改造方案.md §2.1 动静约定
 */
export const I18N_STATIC_SCOPES = ['portal', 'console', 'common', 'admin'] as const;
/**
 * 动态 scope（默认排除，防 payload 膨胀；仅显式请求或后端消费）
 * 见 docs/多语言i18n改造方案.md §2.1 动静约定
 */
export const I18N_DYNAMIC_SCOPES = ['error', 'email', 'notification'] as const;
/** 全部 scope（public 端点可请求并集；由 parseI18nScopes 决定动态是否放行） */
export const I18N_ALL_SCOPES = [...I18N_STATIC_SCOPES, ...I18N_DYNAMIC_SCOPES] as const;

/**
 * 解析公开词典接口的 scope 入参（纯函数，便于单测）
 *
 * 兼容两种传参形式：
 *   · `?scope=console,common`        — 逗号分隔
 *   · `?scope=console&scope=common`  — 重复 query（Fastify 解析为数组）
 *
 * **向后兼容**：scope 缺省 / 空 → 只返回 `['portal']`（保持现状）。
 * 显式传入 → 返回去重后的请求值并集，动态 scope 仅在**显式**出现时才放行
 * （error/email/notification 默认不含，防 payload 膨胀）。
 *
 * @param raw - 原始 scope 入参（string | string[] | null）
 * @returns 去重后的有效 scope 数组；空入参返回 `['portal']`
 *
 * @example
 * ```ts
 * parseI18nScopes(undefined)          // ['portal']
 * parseI18nScopes('console,common')   // ['console','common']
 * parseI18nScopes(['console','common']) // ['console','common']
 * parseI18nScopes('console,console')  // ['console']
 * ```
 */
export function parseI18nScopes(raw?: string | string[] | null): string[] {
  const tokens = Array.isArray(raw) ? raw : [raw ?? null];
  const requested: string[] = [];
  for (const t of tokens) {
    if (t == null) continue;
    for (const part of String(t).split(',')) {
      const trimmed = part.trim();
      if (trimmed) requested.push(trimmed);
    }
  }
  const deduped = [...new Set(requested)];
  if (deduped.length === 0) return ['portal'];
  // 动态 scope 默认排除：仅当显式出现在请求值时放行
  return deduped.filter((s) => (I18N_ALL_SCOPES as readonly string[]).includes(s));
}

/**
 * 扁平键（小写、去 `-`/`_`）→ 规范 I18nLang 映射。
 * 归一化先把入参压成扁平键再查此表，从而统一 `zh_cn`/`zh-CN`/`zhcN` 等任意变体。
 */
const CANONICAL_BY_FLAT: Readonly<Record<string, I18nLang>> = {
  zhcn: 'zh-CN',
  en: 'en',
  enus: 'en',   // zh-CN 方言带地区码，en 自身即规范形（en_us → en）
  jajp: 'ja-JP',
  kokr: 'ko-KR',
  vi: 'vi',
  th: 'th',
  id: 'id',
  fil: 'fil',
};

/**
 * 归一化语言代码：小写 → 去除分隔符 → 查白名单 → 返回规范 I18nLang
 *
 * 非法输入（null / 空串 / 未知语言 / 超长 / 非白名单）返回 null，
 * 由调用方决定策略：写路径抛 ValidationError；读路径回退默认语言。
 *
 * @param v - 原始语言代码（如 `zh_cn`、`en-US`、`vi`、`FIL`），可为 null/undefined
 * @returns 规范化后的 I18nLang；不在白名单内返回 null
 *
 * @example
 * ```ts
 * normalizeI18nLang('zh_cn')  // 'zh-CN'
 * normalizeI18nLang('en-US')  // 'en'
 * normalizeI18nLang('fr')     // null
 * normalizeI18nLang(null)     // null
 * ```
 */
export function normalizeI18nLang(v?: string | null): I18nLang | null {
  if (v == null) return null;
  const flat = String(v).toLowerCase().replace(/[\s-_]/g, '');
  if (!flat) return null;
  // 防超长输入：白名单内任一扁平键最大长度 5（enus/ja_jp→jajp 5），大于直接拒绝
  if (flat.length > 5) return null;
  return CANONICAL_BY_FLAT[flat] ?? null;
}
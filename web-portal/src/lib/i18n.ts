/**
 * Portal 轻量 i18n 层（P2-3）— 零新增依赖
 *
 * 方案（已文档化取舍）：
 * - 语言：zh-CN（默认）/ en；语言选择存 cookie（3cloud_portal_lang），
 *   页面同时支持 ?lang=en 查询参数（优先级高于 cookie），便于 hreflang/SEO 直链。
 *   未采用 SPEC-§23 建议的 /zh /en URL 子路径（全站改造量大、破坏既有 URL 与
 *   控制台 redirects），取舍说明见最终交付报告。
 * - 数据源：服务端拉取 GET /api/v1/public/i18n/entries?lang=xx（no-store），
 *   返回 { key: value } 映射；只含 status='active' + scope='portal' 的条目。
 * - 回退：英文为默认源语（EN_DEFAULTS 内嵌英文原文）；任何语言缺 key 时
 *   显示英文原文（SPEC-§23 验收标准 4「翻译缺失时降级显示英文」）。
 *
 * @see docs/SPEC-§23-系统级能力增强.md §23.4
 * @module lib/i18n
 */

export const PORTAL_LANGS = ["zh-CN", "en"] as const;
export type PortalLang = (typeof PORTAL_LANGS)[number];
export const DEFAULT_LANG: PortalLang = "zh-CN";
/** 语言 cookie 名（前端语言切换器写入） */
export const LANG_COOKIE = "3cloud_portal_lang";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

/** 英文源语字典：任何语言缺 key 时回退到此处（与 seed 中 en 条目一致） */
export const EN_DEFAULTS: Record<string, string> = {
  // nav
  "nav.home": "Home",
  "nav.models": "Models",
  "nav.pricing": "Pricing",
  "nav.about": "About",
  "nav.status": "Status",
  "nav.blog": "Blog",
  "nav.login": "Sign in",
  // home.hero
  "home.hero.title": "One-stop AI API Aggregation Platform",
  "home.hero.subtitle": "Unified access to DeepSeek, Qwen, GLM, GPT, Claude and more — smart routing, unified billing, fine-grained operations with a single API",
  "home.hero.browseModels": "Browse Models",
  "home.hero.viewPricing": "View Pricing",
  "home.hero.signup": "Sign up / Sign in",
  "home.hero.quickstart": "Quick start",
  // home.stats
  "home.stats.models": "Models",
  "home.stats.vendors": "Vendors",
  "home.stats.users": "Users",
  "home.stats.tokens": "Total Tokens",
  // home.features
  "home.features.title": "Why 3Cloud",
  "home.features.subtitle": "One integration for every AI scenario",
  "home.features.unified.title": "Unified Access",
  "home.features.unified.desc": "One API key for 200+ models across vendors, OpenAI-compatible, zero-code migration",
  "home.features.routing.title": "Smart Routing",
  "home.features.routing.desc": "Auto-select the best supplier with multi-channel failover and circuit breaking",
  "home.features.billing.title": "Unified Billing",
  "home.features.billing.desc": "Real-time token-level billing, one bill for all models, with balance alerts",
  "home.features.vendors.title": "Multi-vendor",
  "home.features.vendors.desc": "Connect to DeepSeek, OpenAI, Anthropic, Google, Zhipu and other leading vendors",
  "home.features.security.title": "Security & Compliance",
  "home.features.security.desc": "IP allowlists, usage limits, audit logs and encrypted transport for enterprise needs",
  "home.features.multidevice.title": "Multi-platform",
  "home.features.multidevice.desc": "Web console + API + agent panel covering dev, operations and management",
  // home.popular
  "home.popular.title": "Popular Models",
  "home.popular.subtitle": "Chat, embedding, image, audio and more",
  "home.popular.viewAll": "View all models",
  // home.how
  "home.how.title": "Start in 3 Steps",
  "home.how.subtitle": "From signup to first call in under 3 minutes",
  "home.how.step1.title": "Create Account",
  "home.how.step1.desc": "Sign up with email, complete verification and get ¥5 trial credit",
  "home.how.step2.title": "Create API Key",
  "home.how.step2.desc": "Create an API key in the console with permissions and limits",
  "home.how.step3.title": "Call Models",
  "home.how.step3.desc": "Call via OpenAI-compatible APIs with cURL, Python or Node.js",
  // home.dev
  "home.dev.title": "Developer Friendly",
  "home.dev.subtitle": "OpenAI SDK compatible — integrate in a few lines",
  // home.pricing preview
  "home.pricing.title": "Transparent Pricing",
  "home.pricing.subtitle": "Pay as you go, no hidden fees",
  "home.pricing.model": "Model",
  "home.pricing.category": "Category",
  "home.pricing.input": "Input / 1K tokens",
  "home.pricing.output": "Output / 1K tokens",
  "home.pricing.context": "Context",
  "home.pricing.viewAll": "View full pricing",
  // home.faq
  "home.faq.title": "FAQ",
  "home.faq.q1": "What is 3Cloud?",
  "home.faq.a1": "3Cloud is an AI API aggregation platform that unifies access to models from multiple vendors through one API key.",
  "home.faq.q2": "How does billing work?",
  "home.faq.a2": "Billed per token with separate input/output rates. Pay only for what you use, no monthly fee.",
  "home.faq.q3": "Which models are supported?",
  "home.faq.a3": "Chat, embedding, image, audio and video models from DeepSeek, Qwen, GLM, GPT, Claude, Gemini and more.",
  "home.faq.q4": "How do I get started?",
  "home.faq.a4": "Sign up → verify → create an API key → call via OpenAI-compatible APIs. New users get ¥5 trial credit.",
  "home.faq.q5": "Is the OpenAI SDK supported?",
  "home.faq.a5": "Fully compatible. Point the SDK base_url to the platform endpoint with a 3Cloud API key.",
  "home.faq.q6": "What if a vendor fails?",
  "home.faq.a6": "The routing engine monitors vendor health and fails over automatically to keep service available.",
  "home.faq.q7": "Do enterprise users get discounts?",
  "home.faq.a7": "Yes. Contact sales for custom pricing, dedicated discounts and priority support.",
  // home.cta
  "home.cta.title": "Ready to get started?",
  "home.cta.subtitle": "Get ¥5 trial credit on signup",
  "home.cta.button": "Sign up free",
  // footer
  "footer.product": "Product",
  "footer.resources": "Resources",
  "footer.legal": "Legal",
  // pricing
  "pricing.title": "Model Pricing",
  "pricing.subtitle": "Transparent · Pay-as-you-go · No hidden fees · Live prices",
  "pricing.calculator": "Price Calculator",
  "pricing.allModels": "All Model Prices",
  "pricing.allLabel": "All",
  "pricing.empty": "No model data",
  "pricing.table.model": "Model",
  "pricing.table.vendor": "Vendor",
  "pricing.table.category": "Category",
  "pricing.table.input": "Input / 1K tokens",
  "pricing.table.output": "Output / 1K tokens",
  "pricing.table.context": "Context length",
  "pricing.faq.title": "Billing Notes",
  "pricing.faq.q1": "What does list price mean?",
  "pricing.faq.a1": "The list price is the standard public price configured per vendor-model, the base price before any discount.",
  "pricing.faq.q2": "How is billing calculated?",
  "pricing.faq.a2": "Per-token billing with separate input/output rates, deducted automatically per call.",
  "pricing.faq.q3": "Are there plans?",
  "pricing.faq.a3": "Pay as you go. For higher limits or custom discounts, contact sales.",
  "pricing.faq.q4": "Is there free credit?",
  "pricing.faq.a4": "New users get ¥5 trial credit after verification to try all models.",
  "pricing.faq.q5": "Do prices change?",
  "pricing.faq.a5": "Prices update automatically when vendor costs change; the list is always live.",
  "pricing.calc.title": "Price Calculator",
  "pricing.calc.model": "Model",
  "pricing.calc.selectPlaceholder": "Select a model",
  "pricing.calc.inputTokens": "Input Tokens",
  "pricing.calc.outputTokens": "Output Tokens",
  "pricing.calc.selectPrompt": "Select a model to calculate",
  "pricing.calc.estimate": "Estimated cost",
  // blog
  "blog.title": "Blog / News",
  "blog.subtitle": "Product updates, tech sharing and announcements",
  "blog.empty": "No posts yet",
  "blog.publishedAt": "Published",
  "blog.back": "← Back to blog",
  "blog.notFound": "Post not found or unpublished",
  // help（[?] 帮助文案）
  "help.langSwitcher": "Switch the portal language; untranslated text falls back to English.",
  "help.home": "Portal home: platform capabilities, popular models, pricing and FAQ. Role: all visitors.",
  "help.pricing": "Pricing page: all model prices plus a live price calculator. Role: all visitors.",
  "help.blog": "Blog list: published platform posts (updates / tech / announcements). Role: all visitors.",
  "help.blogPost": "Blog post: article content. Role: all visitors.",
};

/** 规范化语言代码：仅接受 en，其余回落 zh-CN */
export function normalizeLang(v: string | null | undefined): PortalLang {
  if (v === "en") return "en";
  return "zh-CN";
}

/** 解析语言：查询参数（?lang=）优先，其次 cookie，最后默认 zh-CN */
export function resolveLang(
  searchParamsLang: string | null | undefined,
  cookieLang: PortalLang,
): PortalLang {
  return normalizeLang(searchParamsLang ?? cookieLang ?? DEFAULT_LANG);
}

/** 服务端拉取指定语言的词典（no-store；失败返回空映射，由回退兜底） */
export async function fetchDictionary(lang: PortalLang): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/public/i18n/entries?lang=${encodeURIComponent(lang)}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const body = await res.json();
      const map = body?.data ?? body ?? {};
      return typeof map === "object" && map !== null ? (map as Record<string, string>) : {};
    }
  } catch {
    /* 词典拉取失败 → 空映射，全部回退英文源语 */
  }
  return {};
}

/**
 * 生成翻译函数：dict[key] ?? EN_DEFAULTS[key] ?? key（英文为默认源语）
 *
 * @param dict - 当前语言词典（服务端拉取）
 * @returns 翻译函数，未翻译 key 显示英文原文
 */
export function makeT(dict: Record<string, string>) {
  return (key: string): string => dict[key] ?? EN_DEFAULTS[key] ?? key;
}

/**
 * 站点 metadata alternates（hreflang 最佳实践；cookie 方案下 en 用 ?lang=en 直链）
 *
 * @param path - 当前页面路径（默认根路径）
 */
export function siteAlternates(path = "/") {
  const enHref = path === "/" ? "/?lang=en" : `${path}?lang=en`;
  return {
    languages: {
      "zh-CN": path,
      "en": enHref,
    },
  };
}

/**
 * 控制台（Console）轻量 i18n 层 — P1 骨架（零新增业务依赖）
 *
 * 覆盖「个人用户 + 企业 Vendor + 管理后台」三合一 SPA（basename=/app）。
 * 语言集合为 8 种（与方案 §2.1/§6 拍板一致）：zh-CN / en / ja-JP / ko-KR / vi / th / id / fil。
 * 数据源与门户同契约：GET /api/v1/public/i18n/entries?lang=&scope=console,common（多 scope 逗号合并）。
 * 回退链：dict[key] → EN_DEFAULTS[key] → key 原文。
 *
 * 注意：此处 CONSOLE_LANGS 是「消费端」语言白名单（8 语言）；
 * 与 AdminI18nPage.tsx 里仅 4 语言的管理端 LANGS 无关，勿混用。
 *
 * @see docs/多语言i18n改造方案.md §2.2 / §2.5
 * @module lib/i18n
 */

export const CONSOLE_LANGS = ["zh-CN", "en", "ja-JP", "ko-KR", "vi", "th", "id", "fil"] as const;
export type I18nLang = (typeof CONSOLE_LANGS)[number];

/** 语言 localStorage 键（首期用 localStorage 满足登录前同步渲染；cookie 名按方案为 3cloud_console_lang，域名隔离，暂不强制写 cookie） */
export const LANG_KEY = "3cloud_console_lang";
/** 语言 cookie 名（方案 §2.2 建议，域名与门户 3cloud_portal_lang 区分；首期未强制写，仅为契约标注） */
export const LANG_COOKIE = "3cloud_console_lang";
/** 门户首页语言 cookie 名 — 用户先在门户首页切换语言时会写此 cookie；控制台登录页读取它作为兜底，保证「首页选了语言 → 登录页跟随」一致性。 */
export const PORTAL_LANG_COOKIE = "3cloud_portal_lang";

/**
 * 读取指定 cookie 值（浏览器环境守卫，便于测试/SSR）。
 *
 * @param name - cookie 名
 * @returns cookie 值；不存在或不可读返回 null
 */
export function readCookie(name: string): string | null {
  try {
    if (typeof document === "undefined") return null;
    const m = document.cookie
      .split(";")
      .map((s) => s.trim())
      .find((c) => c.startsWith(`${name}=`));
    return m ? m.slice(name.length + 1) : null;
  } catch {
    return null;
  }
}

/** 读取门户首页语言 cookie（未设置返回 null） */
export function readPortalLang(): string | null {
  return readCookie(PORTAL_LANG_COOKIE);
}

const DEFAULT_LANG: I18nLang = "zh-CN";
const API_BASE = process.env.API_BASE_URL ?? "";

/**
 * 英文源语字典 — 内置一份 console/common 高频 key 的最小集。
 * 词典拉取失败或后端缺 key 时回退到此处（英文原文），再缺则回退 key 原文。
 * 首期不强求齐全，高频 key（导航/登录/账单/退出等）按常见 AI 控制台文案自填。
 */
export const EN_DEFAULTS: Record<string, string> = {
  // ── 通用按钮（scope: common）──
  "common.login": "Sign in",
  "common.register": "Sign up",
  "common.logout": "Sign out",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.submit": "Submit",
  "common.back": "Back",
  "common.loading": "Loading...",
  "common.search": "Search",
  "common.reset": "Reset",
  "common.add": "Add",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.copy": "Copy",
  "common.enable": "Enable",
  "common.disable": "Disable",
  "common.status": "Status",
  "common.actions": "Actions",
  "common.create": "Create",
  "common.success": "Success",
  "common.failed": "Failed",
  "common.account": "Account",
  "common.balance": "Balance",
  "common.language": "Language",
  "common.help": "Help",
  "common.enabled": "Enabled",
  "common.disabled": "Disabled",
  "common.active": "Active",
  "common.inactive": "Inactive",
  "common.pending": "Pending",
  "common.required": "Required",
  "common.optional": "Optional",
  "common.next": "Next",
  "common.previous": "Previous",
  "common.default": "Default",
  "common.name": "Name",
  // 通用表格列/P2 补充
  "common.time": "Time",
  "common.model": "Model",
  "common.token": "Tokens",
  "common.cost": "Cost",
  "common.currency": "Amount",

  // ── 导航（scope: console）──
  "nav.dashboard": "Dashboard",
  "nav.statistics": "Statistics",
  "nav.apiKeys": "API Keys",
  "nav.logs": "Logs",
  "nav.recharge": "Recharge",
  "nav.billing": "Billing",
  "nav.invoices": "Invoices",
  "nav.playground": "API Playground",
  "nav.mjTasks": "MJ/Suno Tasks",
  "nav.topupRecords": "Top-up Records",
  "nav.redemption": "Redemption",
  "nav.announcements": "Announcements",
  "nav.realName": "Real-name Verification",
  "nav.notification": "Notifications",
  "nav.tickets": "Tickets",
  "nav.chat": "Live Support",
  "nav.security": "Security",
  "nav.dataExport": "Data Export",
  "nav.userGroups": "User Groups",
  "nav.vendorSelector": "Vendor Selection",
  "nav.accountDeletion": "Account Deletion",
  "nav.help": "Help",
  "nav.settings": "Settings",
  "nav.profile": "Profile",
  // 管理员 / 财务 / 销售 / 代理 导航
  "nav.adminCockpit": "Data Cockpit",
  "nav.adminDashboard": "Operations Dashboard",
  "nav.financeWorkbench": "Finance Workbench",
  "nav.salesWorkbench": "Sales Workbench",
  "nav.salesCustomers": "Customer Management",
  "nav.salesReminders": "Follow-up Reminders",
  "nav.salesPerformance": "Performance Dashboard",
  "nav.financeTopup": "Manual Top-up",
  "nav.financeOrders": "Recharge Orders",
  "nav.financeRefunds": "Refund Review",
  "nav.financeReconciliation": "Reconciliation Report",
  "nav.financeCustomers": "Customer List",
  "nav.agentDashboard": "Agent Workbench",
  "nav.agentCommission": "Commission Records",
  "nav.agentConsumption": "Customer Consumption",
  "nav.agentCustomers": "My Customers",
  "nav.agentInvite": "Invite Customers",
  "nav.agentRanking": "Performance Ranking",
  "nav.agentWithdraw": "Withdrawal Management",
  "nav.agentSettings": "Agent Settings",
  "nav.agentSettlements": "Settlement Reconciliation",

  // ── 登录/注册（scope: common + console）──
  "auth.pageTitle": "Sign in",
  "auth.pageTitle2fa": "Two-factor Verification",
  "auth.registerTitle": "Create Account",
  "auth.title": "Sign in to your account",
  "auth.subtitle": "Manage your API keys and view usage",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.forgotPassword": "Forgot password?",
  "auth.captcha": "Captcha",
  "auth.loginButton": "Sign in",
  "auth.loggingIn": "Signing in...",
  "auth.noAccount": "Don't have an account?",
  "auth.register": "Sign up",
  "auth.registering": "Signing up...",
  "auth.registerNow": "Register now",
  "auth.haveAccount": "Already have an account?",
  "auth.loginNow": "Sign in now",
  "auth.orUse": "or use",
  "auth.welcomeBack": "Welcome back!",
  "auth.otpCode": "Authenticator code",
  "auth.backupCode": "Backup recovery code",
  "auth.verifyAndLogin": "Verify & sign in",
  "auth.verifying": "Verifying...",
  "auth.backToLogin": "Back to password login",
  "auth.2faHint": "This account has two-factor authentication enabled. Enter your authenticator code or backup recovery code to finish signing in.",
  "auth.loginHelp": "Sign in to your account to manage API keys and view usage records.",
  "auth.emailHelp": "Enter the email address you registered with.",
  "auth.passwordHelp": "Enter your login password.",
  "auth.registerHelp": "Register to start using the 3Cloud API Token service.",
  "auth.emailPlaceholder": "your@email.com",
  "auth.passwordPlaceholder": "Enter your password",
  "auth.captchaPlaceholder": "Enter captcha",
  "auth.sessionSuccess": "Signed in successfully",
  "auth.2faEnabledToast": "This account has two-factor authentication enabled. Please enter the verification code to finish signing in.",
  "auth.invalidResponse": "Unexpected login response, please try again later.",
  "auth.socialComingSoon": "{provider} sign-in is coming soon",
  "auth.registerSuccessTitle": "Registration Succeeded!",
  "auth.activationSent": "Activation link sent to",
  "auth.openEmailToActivate": "Please open the email and click the link to activate your account. The link validity is configured by the platform.",
  "auth.goToLogin": "Go to sign in",
  "auth.emailRequired": "Password must be at least 8 characters containing letters, numbers and special characters",
  "auth.passwordMismatch": "Passwords do not match",
  "auth.passwordStrength": "Password strength:",
  "auth.strengthNotEntered": "Not entered",
  "auth.strengthTooWeak": "Weak — increase complexity",
  "auth.strengthMedium": "Medium — acceptable",
  "auth.strengthStronger": "Strong — recommended",
  "auth.strengthStrong": "Strong — very secure",
  "auth.confirmPassword": "Confirm password",
  "auth.inviteCode": "Invite code (optional)",
  "auth.orUseEmail": "Email",

  // ── 供应商 Vendor 自助端（scope: console）──
  "vendor.title": "Vendor Self-service Platform",
  "vendor.subtitle": "Sign in to manage your models, statistics and settlements",
  "vendor.loginButton": "Sign in",
  "vendor.loggingIn": "Signing in...",
  "vendor.emailLabel": "Contact email",
  "vendor.emailPlaceholder": "Vendor registered email",
  "vendor.passwordLabel": "Password",
  "vendor.passwordPlaceholder": "Password (at least 8 characters)",
  "vendor.noAccount": "Don't have a vendor account?",
  "vendor.applyOnboard": "Apply for onboarding",
  "vendor.registerTitle": "Vendor Onboarding Application",
  "vendor.registerSubtitle": "Submit the required information; once approved you can integrate with the platform",
  "vendor.submitApplication": "Submit onboarding application",
  "vendor.submitting": "Submitting...",
  "vendor.basicInfo": "Basic Information",
  "vendor.apiInfo": "API Integration Information",
  "vendor.goToLogin": "Back to sign in",
  "vendor.reviewMessage": "The platform will review your application within 1-3 business days. Once approved, sign in with your registered email.",
  "vendor.errorSubmit": "Failed to submit. Please try again.",

  // ── 顶栏 / 账户菜单（scope: console）──
  "topbar.account": "Account",
  "topbar.personalSettings": "Personal Settings",
  "topbar.changePassword": "Change Password",
  "topbar.balance": "Balance",
  "topbar.notifications": "Notifications",
  "topbar.languageSwitcher": "Language",
  "topbar.langHelp": "Switch the console language; untranslated text falls back to English.",
  "topbar.roleAdmin": "ADMIN",

  // ── 金额 / 账单（scope: common + console）──
  "billing.balance": "Balance",
  "billing.todayCost": "Today's Cost",
  "billing.totalCost": "Total Cost",
  "billing.rechargeNow": "Recharge Now",

  // ── 个人仪表盘 Dashboard（scope: console）──
  "dashboard.title": "Dashboard",
  "dashboard.help.overview": "Overview of your account status.",
  "dashboard.help.overviewDetail": "Account overview: balance, spend, call volume and active API keys.",
  "dashboard.balance": "Account Balance",
  "dashboard.rechargeNow": "Recharge now",
  "dashboard.monthlyCost": "This Month's Spend",
  "dashboard.viewDetail": "View details",
  "dashboard.todayCalls": "Today's Calls",
  "dashboard.activeKeys": "Active API Keys",
  "dashboard.manageKeys": "Manage",
  "dashboard.subs.todayCalls": "Today's Calls",
  "dashboard.subs.successRate": "Success rate {rate}",
  "dashboard.subs.tokenUsage": "Token Usage",
  "dashboard.subs.todayCost": "Today's Cost",
  "dashboard.subs.balance": "Current Balance",
  "dashboard.subs.estimatedDays": "Est. available {days} days",
  "dashboard.trend.title": "Model Token Usage Curve",
  "dashboard.trend.today": "Today",
  "dashboard.trend.yesterday": "Yesterday",
  "dashboard.trend.week": "This Week",
  "dashboard.trend.lastMonth": "Last Month",
  "dashboard.trend.selected": "Selected: {range}",
  "dashboard.trend.missingBackend": "Trend chart requires the backend /me/stats/trend endpoint",
  "dashboard.distribution.title": "Model Call Distribution",
  "dashboard.distribution.recentHour": "Last hour",
  "dashboard.distribution.callsTokens": "{calls} calls · {tokens} Token",
  "dashboard.recent.title": "Recent Consumption",
  "dashboard.recent.viewAll": "View all",
  "dashboard.quick.recharge": "Recharge",
  "dashboard.quick.createKey": "Create API Key",
  "dashboard.quick.logs": "Consumption Details",
  "dashboard.quick.ticket": "Submit Ticket",

  // ── API Key 管理（scope: console）──
  "apikey.title": "API Key Management",
  "apikey.help.title": "Manage API access keys. Supports 3 permission modes and IP allowlists.",
  "apikey.endpoint.title": "Access Endpoints",
  "apikey.endpoint.configHint": "(configurable under Admin → System Settings → API Services)",
  "apikey.endpoint.chat": "Chat endpoints",
  "apikey.new.defaultName": "New Key",
  "apikey.create.button": "Create Key",
  "apikey.create.title": "Create API Key",
  "apikey.help.create": "Create a new API access key; you can specify permission mode and expiry.",
  "apikey.search.placeholder": "Search key name…",
  "apikey.created.oneTime": "API Key created successfully — shown only once, copy it now",
  "apikey.copy.key": "Copy Key",
  "apikey.empty": "No API keys yet. Click \"Create Key\" to get started.",
  "apikey.created.success": "API Key created",
  "apikey.deleted.success": "API Key deleted",
  "apikey.copied": "Copied to clipboard",
  "apikey.col.name": "Name",
  "apikey.col.mode": "Permission Mode",
  "apikey.col.lastUsed": "Last Used",
  "apikey.col.todayCalls": "Today's Calls",
  "apikey.mode.vendor": "A - Bind Vendor + Models",
  "apikey.mode.group": "B - Bind Model Group",
  "apikey.mode.unlimited": "C - Unlimited",
  "apikey.status.expiring": "Expiring Soon",
  "apikey.delete.confirm": "Delete this API key?",
  "apikey.form.name.placeholder": "e.g. Production",
  "apikey.form.mode": "Permission Mode",
  "apikey.help.mode": "A: Bind vendor + models / B: Bind model group / C: Unlimited",
  "apikey.form.group": "Select Group",
  "apikey.form.expiry": "Expiry Time",
  "apikey.form.ipHint": "(optional, one per line)",
  "apikey.form.creating": "Creating...",
  "apikey.form.confirm": "Confirm Create",
};

/** 规范化语言代码：仅接受 8 语言白名单，其余回落 zh-CN */
export function normalizeLang(v: string | null | undefined): I18nLang {
  if (v && (CONSOLE_LANGS as readonly string[]).includes(v)) {
    return v as I18nLang;
  }
  return DEFAULT_LANG;
}

/**
 * 是否为合法语言（白名单内）。与 normalizeLang 的区别：
 * normalizeLang 会把非法值兜底为 'zh-CN'（合法），这里直接对**原始值**判白名单，
 * 供 resolveLang 逐层判定时「非法值不吞掉后续更高优先级源」。
 */
function isLegalLang(v: unknown): v is I18nLang {
  return (
    typeof v === "string" &&
    (CONSOLE_LANGS as readonly string[]).includes(v)
  );
}

/**
 * 解析当前语言 — 优先级（防闪现抖动核心，评审要点 B）：
 *   ?lang > localStorage/sessionStorage(persisted) > navigator.language > 'zh-CN'
 * 说明：登录后 server(language) 覆盖由 i18n-context 挂载时异步执行，不在此纯函数内。
 *
 * @param searchParamsLang - 查询参数 ?lang=
 * @param persisted - localStorage 持久化值（登录前同步渲染）
 * @param navigatorLang - navigator.language（可传 undefined 便于测试/非浏览器环境）
 */
export function resolveLang(
  searchParamsLang: string | null | undefined,
  persisted: string | null | undefined,
  navigatorLang: string | null | undefined,
): I18nLang {
  // 逐层用 isLegalLang 判原始值白名单：非法值不吞掉后续更高优先级源
  if (isLegalLang(searchParamsLang)) return searchParamsLang;
  if (isLegalLang(persisted)) return persisted;
  if (isLegalLang(navigatorLang)) return navigatorLang;
  return DEFAULT_LANG;
}

/**
 * 读取当前生效语言（非 React 环境用，供 fmt.ts 等显示层格式化调用）。
 * 优先级：localStorage 持久化值（同步）> 门户 cookie > navigator.language > 默认 zh-CN。
 * 注意：不参与 ?lang 判定（query 仅挂载首帧一次生效），保证格式化与界面语言一致且稳定。
 */
export function getI18nLang(): I18nLang {
  let persisted: string | null = null;
  try {
    persisted = typeof window !== "undefined" ? window.localStorage.getItem(LANG_KEY) : null;
  } catch {
    /* localStorage 不可用时忽略 */
  }
  if (persisted) {
    const n = normalizeLang(persisted);
    if ((CONSOLE_LANGS as readonly string[]).includes(n)) return n;
  }
  // 门户首页语言 cookie 兜底：用户先在首页切换语言时保持控制台登录页一致
  const portalLang = readPortalLang();
  if (portalLang) {
    const n = normalizeLang(portalLang);
    if ((CONSOLE_LANGS as readonly string[]).includes(n)) return n;
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : undefined;
  return normalizeLang(nav ?? null);
}

export type I18nScope = "console" | "common";

export interface DictionaryInput {
  lang: string;
  scopes: I18nScope[];
}

/**
 * 服务端拉取指定语言的词典（多 scope 逗号合并；失败返回 {} 由回退兜底）。
 * GET /api/v1/public/i18n/entries?lang=&scope=console,common
 *
 * @param lang - 规范化语言代码
 * @param scopes - 要拉取的静态 scope（console/common；error/email/notification 为动态 scope 默认不拉）
 */
export async function fetchDictionary(lang: I18nLang, scopes: I18nScope[]): Promise<Record<string, string>> {
  if (scopes.length === 0) return {};
  const params = new URLSearchParams();
  params.set("lang", lang);
  // 多 scope 用逗号合并（方案 §2.2 后续版本同时支持重复 scope 参数；现后端按逗号合并）
  params.set("scope", scopes.join(","));
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/i18n/entries?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return {};
    const body = await res.json();
    const map = body?.data ?? body ?? {};
    return typeof map === "object" && map !== null ? (map as Record<string, string>) : {};
  } catch {
    /* 词典拉取失败 → 空映射，全部回退英文源语 */
    return {};
  }
}

/**
 * 生成翻译函数：dict[key] ?? EN_DEFAULTS[key] ?? key（英文为默认源语）。
 * 支持可选参数插值：模板值中的 `{param}` 会被替换为 params[param]。
 * 用于动态文案（如 "预计可用 {days} 天"），对齐方案 §2.3(4) 的参数化 message key 约定。
 *
 * @param dict - 当前语言词典（服务端拉取，可能为空）
 * @returns 翻译函数，未翻译 key 显示英文原文，再缺回退 key 原文
 */
export function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>): string => {
    const raw = dict[key] ?? EN_DEFAULTS[key] ?? key;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
      params[name] != null ? String(params[name]) : `{${name}}`,
    );
  };
}

// ════════════════════ 模块级词典缓存（非 React state）════════════════════

/** 已加载的词典缓存实例（切语言时重拉合并重建；失败保持旧值由回退兜底） */
let dictCache: Record<string, string> | null = null;
/** 当前缓存对应的语言 */
let dictCacheLang: I18nLang | null = null;

/** 读取当前模块级缓存词典（空 language 返回空对象，不抛错） */
export function getDict(): Record<string, string> {
  return dictCache ?? {};
}

/**
 * 重拉并合并指定语言的词典到模块级缓存（console + common scope 合并）。
 * 成功后更新缓存并返回；失败保持旧缓存并返回 {}（由 makeT 回退兜底）。
 * 幂等：同一 language 已加载时直接返回缓存（避免重复请求）。
 *
 * @param lang - 规范化语言代码
 */
export async function loadDicts(lang: I18nLang): Promise<Record<string, string>> {
  if (dictCache && dictCacheLang === lang) {
    return dictCache;
  }
  const scopes: I18nScope[] = ["console", "common"];
  const dict = await fetchDictionary(lang, scopes);
  dictCacheLang = lang;
  dictCache = dict;
  return dict;
}
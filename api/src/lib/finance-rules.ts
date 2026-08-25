/**
 * 资金规则配置读取 — system_config finance_rules（R1 人工上账单笔上限 + R5 分级审批 + R6 限额 + R7 2FA）
 *
 * 配置结构（ARCH v1.1 §2.1 + 调度终裁 B3/B20：上限统一 1,000,000）：
 * ```json
 * {
 *   "manual_topup": { "max_amount": 1000000 },
 *   "large_amount": {
 *     "single_review_max": 10000, "dual_review_threshold": 10000, "super_review_threshold": 100000,
 *     "review_exempt": { "enabled": false, "max_amount": 1000, "subjects": ["赠送","补偿","纠错"] },
 *     "adjustment_decrease_same_tier": true
 *   },
 *   "limits": {
 *     "soft_limit": 50000, "hard_limit": 100000,
 *     "exceed_action": "escalate", "exempt_roles": [],
 *     "window_hours": 24, "timezone": "Asia/Shanghai"
 *   },
 *   "operation_2fa": { "policy": "mandatory_admin", "token_ttl_seconds": 300,
 *                      "lock_threshold": 5, "lock_minutes": 15, "allow_backup_code": true,
 *                      "enabled": true, "scopes": [...] }
 * }
 * ```
 *
 * 读取优先级：system_config key=`finance_rules` JSON → 常量默认值。
 * 读取失败（行缺失 / JSON 损坏 / DB 异常）回退常量；结果缓存 60s
 * （resetFinanceRulesCache 清空，配置保存端点/测试即时生效）。不引入新依赖。
 *
 * 裁决来源：
 * - R5 分级审批（ARCH §2 / 双签 B1/B2/B4/B18）；人工上账创建上限 50,000 → 1,000,000（终裁 B3/Q9）
 * - R6 24h 滚动限额（ARCH §3 / 双签 B5–B9、B19）；soft=升级审批 / hard=429 拒创建（终裁），exceed_action 可配置
 * - R7 操作级 2FA（ARCH §4 / 双签 B11–B14/B17）
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md v1.1 §2.1 / §3 / §4
 * @module lib/finance-rules
 */

import { db, schema } from '../db';
import { eq } from 'drizzle-orm';

/** 人工上账单笔上限默认值（元；终裁 B3：50,000 → 1,000,000，>50,000 由分级审批承接） */
export const MANUAL_TOPUP_MAX_AMOUNT = 1_000_000;

/** 单审档金额上限（元） */
export const APPROVAL_LEVEL1_MAX = 10_000;
/** 双人档金额上限（元） */
export const APPROVAL_LEVEL2_MAX = 100_000;

/** 操作人/被入账用户 24h 软限（元）：超此值强制升级审批（至少双人，终裁 soft） */
export const CREDIT_SOFT_LIMIT = 50_000;
/** 24h 硬限（元）：超此值拒绝创建（终裁 hard） */
export const CREDIT_HARD_LIMIT = 100_000;
/** 计数窗口（小时；滚动窗口 = window_hours × 3600 ms） */
export const CREDIT_WINDOW_HOURS = 24;
/** 时区（Intl.DateTimeFormat 计算，无新依赖） */
export const CREDIT_TIMEZONE = 'Asia/Shanghai';

/** 白名单科目免审默认开关（双签 B2：金额型免审取消，白名单免审默认关） */
export const REVIEW_EXEMPT_ENABLED_DEFAULT = false;
/** 白名单科目免审单笔上限（元，双签 B2） */
export const REVIEW_EXEMPT_MAX_AMOUNT = 1_000;
/** 白名单科目默认集合（双签 B2：开启时仅 {赠送,补偿,纠错} 免审） */
export const REVIEW_EXEMPT_SUBJECTS_DEFAULT: string[] = ['赠送', '补偿', '纠错'];

/** 操作级 2FA 默认配置（R7，ARCH §4 / 双签 B11–B14） */
export const OPERATION_2FA_DEFAULTS: Operation2faConfig = {
  enabled: true,
  policy: 'mandatory_admin',
  tokenTtlSeconds: 300,
  lockThreshold: 5,
  lockMinutes: 15,
  allowBackupCode: true,
  scopes: ['manual_topup.create', 'manual_topup.review', 'adjust.create', 'adjust.approve', 'adjust.review', 'adjust.reject', 'adjust.reverse', 'recharge.audit', 'recharge.reject', 'refund.review', 'finance_rules.save'],
};

/** 配置缓存 TTL（毫秒） */
const CACHE_TTL_MS = 60_000;

/** 审批规则（large_amount 段解析后） */
export interface ApprovalRules {
  /** 单审档金额上限（元）：amount ≤ singleReviewMax → tier1 */
  singleReviewMax: number;
  /** 双人档触发线（元）：amount > dualReviewThreshold → tier2 起点 */
  dualReviewThreshold: number;
  /** 终审档触发线（元）：amount > superReviewThreshold → tier3 */
  superReviewThreshold: number;
  /** 白名单科目免审开关（默认关；开启时 {赠送,补偿,纠错} 且 ≤¥1,000 且调增 → 免审，计入限额） */
  reviewExemptEnabled: boolean;
  /** 白名单免审单笔上限（元） */
  reviewExemptMaxAmount: number;
  /** 白名单科目集合 */
  reviewExemptSubjects: string[];
  /** 调减是否与调增同档（默认 true；含"恰 singleReviewMax 仍双人"特例，B1） */
  adjustmentDecreaseSameTier: boolean;
}

/** 限额规则（limits 段解析后；soft/hard 同作用于操作人与被入账用户，终裁） */
export interface CreditLimits {
  /** 24h 软限（元）：projected > soft → 升级审批（至少双人） */
  softLimit: number;
  /** 24h 硬限（元）：projected > hard → 429 拒创建（终裁 hard 闸） */
  hardLimit: number;
  /** 超 soft 行为：escalate=升级双人（默认）/ reject=直接 429（双签 B7） */
  exceedAction: 'escalate' | 'reject';
  /** 豁免角色（默认空；super_admin 不豁免，B8；命中角色跳过 op 维度预检） */
  exemptRoles: string[];
  /** 滚动窗口（小时） */
  windowHours: number;
  /** 时区（业务日/展示口径） */
  timezone: string;
}

/** 操作级 2FA 配置（R7，ARCH §4 / §7.3 回滚开关 / PRD §3.3.2） */
export interface Operation2faConfig {
  /** 紧急回滚开关：false = requireOperation2fa 中间件整体放行 */
  enabled: boolean;
  /** 策略：mandatory_admin（默认，资金角色强制）/ disabled */
  policy: 'mandatory_admin' | 'disabled';
  /** 操作令牌有效期（秒） */
  tokenTtlSeconds: number;
  /** 连续失败锁定阈值（与登录共享计数） */
  lockThreshold: number;
  /** 锁定分钟数 */
  lockMinutes: number;
  /** 是否允许备用码 */
  allowBackupCode: boolean;
  /** 适用操作清单（审计与前端同步） */
  scopes: string[];
}

/** system_config finance_rules JSON 原始结构（未知键容错） */
interface RawFinanceRules {
  manual_topup?: { max_amount?: unknown };
  large_amount?: {
    single_review_max?: unknown;
    dual_review_threshold?: unknown;
    super_review_threshold?: unknown;
    review_exempt?: { enabled?: unknown; max_amount?: unknown; subjects?: unknown };
    adjustment_decrease_same_tier?: unknown;
  };
  limits?: {
    soft_limit?: unknown;
    hard_limit?: unknown;
    exceed_action?: unknown;
    exempt_roles?: unknown;
    window_hours?: unknown;
    timezone?: unknown;
  };
  operation_2fa?: {
    enabled?: unknown;
    policy?: unknown;
    token_ttl_seconds?: unknown;
    lock_threshold?: unknown;
    lock_minutes?: unknown;
    allow_backup_code?: unknown;
    scopes?: unknown;
  };
}

/** 解析后完整配置（缓存单位） */
export interface FinanceRules {
  manualTopupMaxAmount: number;
  approval: ApprovalRules;
  limits: CreditLimits;
  operation2fa: Operation2faConfig;
}

/** 缓存：{ value, at }；null = 未缓存 */
let cached: { value: FinanceRules; at: number } | null = null;

/** 数值字段解析：有限正数 → number，否则回退默认 */
function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 布尔字段解析：非布尔回退默认 */
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** 字符串数组解析：非数组/含非字符串元素回退默认 */
function strArr(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  if (!v.every((x) => typeof x === 'string')) return fallback;
  return v as string[];
}

/** 时区字段解析：非法值回退默认 */
function timezone(v: unknown, fallback: string): string {
  if (typeof v !== 'string' || v.length === 0) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v }).format();
    return v;
  } catch {
    return fallback;
  }
}

/** 读取并解析 finance_rules 配置（60s 缓存；读失败回退默认常量） */
async function loadFinanceRules(): Promise<FinanceRules> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const fallback: FinanceRules = {
    manualTopupMaxAmount: MANUAL_TOPUP_MAX_AMOUNT,
    approval: {
      singleReviewMax: APPROVAL_LEVEL1_MAX,
      dualReviewThreshold: APPROVAL_LEVEL1_MAX,
      superReviewThreshold: APPROVAL_LEVEL2_MAX,
      reviewExemptEnabled: REVIEW_EXEMPT_ENABLED_DEFAULT,
      reviewExemptMaxAmount: REVIEW_EXEMPT_MAX_AMOUNT,
      reviewExemptSubjects: [],
      adjustmentDecreaseSameTier: true,
    },
    limits: {
      softLimit: CREDIT_SOFT_LIMIT,
      hardLimit: CREDIT_HARD_LIMIT,
      exceedAction: 'escalate',
      exemptRoles: [],
      windowHours: CREDIT_WINDOW_HOURS,
      timezone: CREDIT_TIMEZONE,
    },
    operation2fa: { ...OPERATION_2FA_DEFAULTS },
  };
  try {
    const rows = await db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, 'finance_rules'))
      .limit(1);
    const raw = rows[0]?.value;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as RawFinanceRules;
    const exempt = parsed.large_amount?.review_exempt;
    const value: FinanceRules = {
      manualTopupMaxAmount: num(parsed.manual_topup?.max_amount, MANUAL_TOPUP_MAX_AMOUNT),
      approval: {
        singleReviewMax: num(parsed.large_amount?.single_review_max, APPROVAL_LEVEL1_MAX),
        dualReviewThreshold: num(parsed.large_amount?.dual_review_threshold, APPROVAL_LEVEL1_MAX),
        superReviewThreshold: num(parsed.large_amount?.super_review_threshold, APPROVAL_LEVEL2_MAX),
        reviewExemptEnabled: bool(exempt?.enabled, REVIEW_EXEMPT_ENABLED_DEFAULT),
        reviewExemptMaxAmount: num(exempt?.max_amount, REVIEW_EXEMPT_MAX_AMOUNT),
        reviewExemptSubjects: strArr(exempt?.subjects, []),
        adjustmentDecreaseSameTier: bool(parsed.large_amount?.adjustment_decrease_same_tier, true),
      },
      limits: {
        softLimit: num(parsed.limits?.soft_limit, CREDIT_SOFT_LIMIT),
        hardLimit: num(parsed.limits?.hard_limit, CREDIT_HARD_LIMIT),
        exceedAction: parsed.limits?.exceed_action === 'reject' ? 'reject' : 'escalate',
        exemptRoles: strArr(parsed.limits?.exempt_roles, []),
        windowHours: num(parsed.limits?.window_hours, CREDIT_WINDOW_HOURS),
        timezone: timezone(parsed.limits?.timezone, CREDIT_TIMEZONE),
      },
      operation2fa: {
        enabled: bool(parsed.operation_2fa?.enabled, OPERATION_2FA_DEFAULTS.enabled),
        policy: parsed.operation_2fa?.policy === 'disabled' ? 'disabled' : 'mandatory_admin',
        tokenTtlSeconds: num(parsed.operation_2fa?.token_ttl_seconds, OPERATION_2FA_DEFAULTS.tokenTtlSeconds),
        lockThreshold: num(parsed.operation_2fa?.lock_threshold, OPERATION_2FA_DEFAULTS.lockThreshold),
        lockMinutes: num(parsed.operation_2fa?.lock_minutes, OPERATION_2FA_DEFAULTS.lockMinutes),
        allowBackupCode: bool(parsed.operation_2fa?.allow_backup_code, OPERATION_2FA_DEFAULTS.allowBackupCode),
        scopes: strArr(parsed.operation_2fa?.scopes, OPERATION_2FA_DEFAULTS.scopes),
      },
    };
    cached = { value, at: Date.now() };
    return value;
  } catch {
    /* 读失败回退默认 */
    return fallback;
  }
}

/**
 * 读取完整资金规则（配置端点 GET /admin/finance/rules 用）。
 *
 * @returns 完整解析配置；缺失/损坏回退默认常量
 */
export async function getFinanceRules(): Promise<FinanceRules> {
  return loadFinanceRules();
}

/**
 * 读取人工上账单笔金额上限（元）。
 *
 * @returns 上限金额；配置缺失/损坏/读取失败时回退 MANUAL_TOPUP_MAX_AMOUNT（1,000,000）
 */
export async function getManualTopupMaxAmount(): Promise<number> {
  const rules = await loadFinanceRules();
  return rules.manualTopupMaxAmount;
}

/**
 * 读取 R5 分级审批规则（large_amount 段）。
 *
 * @returns 审批阈值与免审配置；配置缺失/损坏/读取失败时回退默认常量
 */
export async function getApprovalRules(): Promise<ApprovalRules> {
  const rules = await loadFinanceRules();
  return rules.approval;
}

/**
 * 读取 R6 24h 限额规则（limits 段）。
 *
 * @returns 软/硬限/超限行为/豁免角色；配置缺失/损坏/读取失败时回退默认常量
 */
export async function getCreditLimits(): Promise<CreditLimits> {
  const rules = await loadFinanceRules();
  return rules.limits;
}

/**
 * 读取 R7 操作级 2FA 配置（含 §7.3 紧急回滚开关 enabled）。
 *
 * @returns 策略/令牌 TTL/锁定阈值；配置缺失/损坏/读取失败时回退默认常量
 */
export async function getOperation2faConfig(): Promise<Operation2faConfig> {
  const rules = await loadFinanceRules();
  return rules.operation2fa;
}

/**
 * 金额档位（R5 统一大额规则 + 双签 B1 特例，纯函数）：
 *   tier1 = 单审（amount ≤ singleReviewMax）
 *   tier2 = 双人（singleReviewMax < amount ≤ superReviewThreshold）
 *   tier3 = 三人 + super_admin 终审（amount > superReviewThreshold）
 *
 * B1 特例：调减恰为 singleReviewMax（¥10,000）仍按双人档（不放松现状更严语义）；
 * 仅当 adjustmentDecreaseSameTier=true 时应用同档+特例（默认 true）。
 *
 * @param amount - 入账金额（元，正数）
 * @param direction - 调账方向（默认 'increase'；仅调减触发 B1 特例）
 * @param rules - 审批规则（默认常量阈值；调用方一般传 getApprovalRules() 结果）
 * @returns 1 | 2 | 3
 *
 * @example
 * calcApprovalTier(10000) // 1（调增恰 ¥10,000 → 单审）
 * calcApprovalTier(10000, 'decrease') // 2（B1：调减恰 ¥10,000 仍双人）
 * calcApprovalTier(10000.01) // 2
 * calcApprovalTier(100000) // 2
 * calcApprovalTier(100000.01) // 3
 */
export function calcApprovalTier(amount: number, direction: 'increase' | 'decrease' = 'increase', rules?: ApprovalRules): 1 | 2 | 3 {
  const singleMax = rules?.singleReviewMax ?? APPROVAL_LEVEL1_MAX;
  const superMax = rules?.superReviewThreshold ?? APPROVAL_LEVEL2_MAX;
  let tier: 1 | 2 | 3;
  if (amount <= singleMax) tier = 1;
  else if (amount <= superMax) tier = 2;
  else tier = 3;
  // B1 特例：调减恰为单审上限仍双人（同档 + 现状更严语义保留）
  const sameTier = rules?.adjustmentDecreaseSameTier ?? true;
  if (direction === 'decrease' && sameTier && amount === singleMax) tier = Math.max(tier, 2) as 1 | 2 | 3;
  return tier;
}

/**
 * 限额升级（R6，纯函数）：任一维度超 soft → 至少双人档（max(tier, 2)）。
 * 只升不降：tier3 不受影响；不自动升终审（PRD §3.2.1 规则 4，仅升级到双人档）。
 *
 * @param tier - calcApprovalTier 结果
 * @param opEscalated - 操作人维度是否超 soft
 * @param userEscalated - 被入账用户维度是否超 soft
 * @returns 1 | 2 | 3
 *
 * @example
 * calcEffectiveTier(1, false, false) // 1
 * calcEffectiveTier(1, true, false) // 2
 * calcEffectiveTier(3, true, false) // 3
 */
export function calcEffectiveTier(tier: 1 | 2 | 3, opEscalated: boolean, userEscalated: boolean): 1 | 2 | 3 {
  if (opEscalated || userEscalated) return Math.max(tier, 2) as 1 | 2 | 3;
  return tier;
}

/**
 * 白名单科目免审（双签 B2：金额型免审废止，仅白名单科目免审保留）：
 *   review_exempt.enabled === true 且 direction==='increase' 且
 *   subject ∈ review_exempt.subjects 且 amount ≤ review_exempt.max_amount（¥1,000）
 *
 * @param subject - 会计科目（业务类型）
 * @param direction - 调账方向（仅 increase 可免审）
 * @param amount - 调增金额（元）
 * @param rules - 审批规则（默认关闭）
 * @returns true = 免审（提交即生效，仍计入 R6 累计）
 */
export function isReviewExempt(subject: string, direction: 'increase' | 'decrease', amount: number, rules?: ApprovalRules): boolean {
  const enabled = rules?.reviewExemptEnabled ?? REVIEW_EXEMPT_ENABLED_DEFAULT;
  if (!enabled) return false;
  if (direction !== 'increase') return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const maxAmount = rules?.reviewExemptMaxAmount ?? REVIEW_EXEMPT_MAX_AMOUNT;
  if (amount > maxAmount) return false;
  const subjects = rules?.reviewExemptSubjects ?? [];
  return subjects.includes(subject);
}

/**
 * 限额豁免角色（双签 B8）：role ∈ limits.exempt_roles → 跳过操作人维度预检（审计标记 limit_exempt）。
 * super_admin 默认不豁免（exempt_roles 默认空）。
 *
 * @param role - 操作者角色
 * @param limits - 限额规则（默认空豁免）
 * @returns true = 豁免
 */
export function isLimitExempt(role: string, limits?: Pick<CreditLimits, 'exemptRoles'>): boolean {
  const roles = limits?.exemptRoles ?? [];
  return roles.includes(role);
}

/**
 * 清空配置缓存（测试用：验证配置变更即时生效；配置保存端点调用后即时生效）。
 */
export function resetFinanceRulesCache(): void {
  cached = null;
}

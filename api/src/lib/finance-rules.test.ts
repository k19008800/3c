/**
 * 资金规则单元/集成测试 — R5 分级审批 + R6 限额配置（真实 PG 读取，style 对齐项目惯例）
 *
 * 覆盖 ARCH v1.1 §6.1 用例 1/2：
 *   1. tier 计算边界：恰 ¥10,000→1（调增，E1）；10,000.01→2（E2）；恰 ¥100,000→2；
 *      100,000.01→3；**调减恰 ¥10,000→2（B1 特例）**；配置缺失/损坏回退默认；
 *      resetFinanceRulesCache 后新配置生效
 *   2. 免审判定（B2）：开关关→不命中；开：{赠送/补偿/纠错} 且 ≤¥1,000 且调增→命中；
 *      调减/超额/非白名单→不命中
 *   另覆盖：calcEffectiveTier（限额升级取 max，只升不降）、getApprovalRules/getCreditLimits
 *   配置解析（large_amount/limits 段）
 *
 * 注意：写入 system_config key='finance_rules' 使用与默认值一致的阈值（仅 manual_topup
 * 上限取 888888 证明配置读取），避免并行 worker 中其他路由测试读到异常阈值。
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md v1.1 §6.1
 * @module lib/finance-rules.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import {
  calcApprovalTier,
  calcEffectiveTier,
  isReviewExempt,
  isLimitExempt,
  getApprovalRules,
  getCreditLimits,
  getManualTopupMaxAmount,
  resetFinanceRulesCache,
  MANUAL_TOPUP_MAX_AMOUNT,
  APPROVAL_LEVEL1_MAX,
  APPROVAL_LEVEL2_MAX,
  CREDIT_SOFT_LIMIT,
  CREDIT_HARD_LIMIT,
} from './finance-rules.js';

const CFG_KEY = 'finance_rules';

describe('calcApprovalTier 边界（R5 统一大额规则 + B1 特例）', () => {
  it('恰 ¥10,000→1（调增）；10,000.01→2；恰 ¥100,000→2；100,000.01→3（默认阈值）', () => {
    expect(calcApprovalTier(10000, 'increase')).toBe(1);
    expect(calcApprovalTier(10000.01, 'increase')).toBe(2);
    expect(calcApprovalTier(100000, 'increase')).toBe(2);
    expect(calcApprovalTier(100000.01, 'increase')).toBe(3);
  });

  it('B1 特例：调减恰 ¥10,000 → 2（双人档，不放松现状更严语义）；调减 9,999 → 1', () => {
    expect(calcApprovalTier(10000, 'decrease')).toBe(2);
    expect(calcApprovalTier(9999, 'decrease')).toBe(1);
    expect(calcApprovalTier(10000.01, 'decrease')).toBe(2);
    expect(calcApprovalTier(100000.01, 'decrease')).toBe(3);
  });

  it('自定义规则生效（single_review_max/dual_review_threshold/super_review_threshold 可配置）', () => {
    const rules = {
      singleReviewMax: 20000,
      dualReviewThreshold: 20000,
      superReviewThreshold: 200000,
      reviewExemptEnabled: false,
      reviewExemptMaxAmount: 1000,
      reviewExemptSubjects: [] as string[],
      adjustmentDecreaseSameTier: true,
    };
    expect(calcApprovalTier(20000, 'increase', rules)).toBe(1);
    expect(calcApprovalTier(20000.01, 'increase', rules)).toBe(2);
    expect(calcApprovalTier(200000, 'increase', rules)).toBe(2);
    expect(calcApprovalTier(200000.01, 'increase', rules)).toBe(3);
  });
});

describe('calcEffectiveTier 限额升级（R6）', () => {
  it('任一维度超 soft → 至少 2；tier3 不受降级影响（只升不降）', () => {
    expect(calcEffectiveTier(1, false, false)).toBe(1);
    expect(calcEffectiveTier(1, true, false)).toBe(2);
    expect(calcEffectiveTier(1, false, true)).toBe(2);
    expect(calcEffectiveTier(2, true, false)).toBe(2);
    expect(calcEffectiveTier(3, true, false)).toBe(3);   // 只升不降
  });
});

describe('isReviewExempt 白名单科目免审（B2）', () => {
  it('默认关闭 → 一律不豁免（金额型免审批废止）', () => {
    expect(isReviewExempt('赠送', 'increase', 100)).toBe(false);
    expect(isReviewExempt('赠送', 'increase', 10)).toBe(false);
  });

  it('开启时：白名单科目命中且 ≤¥1,000 且调增 → true；否则 false', () => {
    const rules = {
      singleReviewMax: 10000,
      dualReviewThreshold: 10000,
      superReviewThreshold: 100000,
      reviewExemptEnabled: true,
      reviewExemptMaxAmount: 1000,
      reviewExemptSubjects: ['赠送', '补偿', '纠错'],
      adjustmentDecreaseSameTier: true,
    };
    expect(isReviewExempt('赠送', 'increase', 100, rules)).toBe(true);
    expect(isReviewExempt('补偿', 'increase', 1000, rules)).toBe(true);   // 恰为上限
    expect(isReviewExempt('赠送', 'increase', 1001, rules)).toBe(false);  // 超 ¥1,000
    expect(isReviewExempt('其他', 'increase', 100, rules)).toBe(false);   // 非白名单科目
    expect(isReviewExempt('赠送', 'decrease', 100, rules)).toBe(false);   // 调减不免审
  });
});

describe('isLimitExempt 限额豁免角色（B8）', () => {
  it('默认空 → 不豁免（super_admin 不豁免）；配置命中 → 豁免', () => {
    expect(isLimitExempt('super_admin')).toBe(false);
    expect(isLimitExempt('admin')).toBe(false);
    expect(isLimitExempt('finance', { exemptRoles: ['finance'] })).toBe(true);
  });
});

describe('配置读取（system_config finance_rules 扩展）', () => {
  beforeAll(async () => {
    // 与默认一致的阈值 + manual_topup.max_amount 取自定义值证明配置读取（888888 > 任何测试金额）
    await db.insert(schema.systemConfig).values({
      key: CFG_KEY,
      value: JSON.stringify({
        manual_topup: { max_amount: 888888 },
        large_amount: {
          single_review_max: 10000,
          dual_review_threshold: 10000,
          super_review_threshold: 100000,
          review_exempt: { enabled: false, max_amount: 1000, subjects: ['赠送', '补偿', '纠错'] },
          adjustment_decrease_same_tier: true,
        },
        limits: { soft_limit: 50000, hard_limit: 100000, exceed_action: 'escalate', exempt_roles: [], window_hours: 24, timezone: 'Asia/Shanghai' },
        operation_2fa: { policy: 'mandatory_admin', token_ttl_seconds: 300, lock_threshold: 5, lock_minutes: 15, allow_backup_code: true },
      }),
      description: 'r5r7 test config',
    }).onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: {
        value: JSON.stringify({
          manual_topup: { max_amount: 888888 },
          large_amount: { single_review_max: 10000, dual_review_threshold: 10000, super_review_threshold: 100000, review_exempt: { enabled: false, max_amount: 1000, subjects: ['赠送', '补偿', '纠错'] }, adjustment_decrease_same_tier: true },
          limits: { soft_limit: 50000, hard_limit: 100000, exceed_action: 'escalate', exempt_roles: [], window_hours: 24, timezone: 'Asia/Shanghai' },
          operation_2fa: { policy: 'mandatory_admin', token_ttl_seconds: 300, lock_threshold: 5, lock_minutes: 15, allow_backup_code: true },
        }),
        description: 'r5r7 test config',
      },
    });
  });

  afterAll(async () => {
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, CFG_KEY));
    resetFinanceRulesCache();
  });

  it('resetFinanceRulesCache 后新配置生效（max_amount 888888 / 阈值默认 / 豁免空）', async () => {
    resetFinanceRulesCache();
    expect(await getManualTopupMaxAmount()).toBe(888888);
    const approval = await getApprovalRules();
    expect(approval.singleReviewMax).toBe(10000);
    expect(approval.dualReviewThreshold).toBe(10000);
    expect(approval.superReviewThreshold).toBe(100000);
    expect(approval.reviewExemptEnabled).toBe(false);
    const limits = await getCreditLimits();
    expect(limits.softLimit).toBe(50000);
    expect(limits.hardLimit).toBe(100000);
    expect(limits.exceedAction).toBe('escalate');
    expect(limits.exemptRoles).toEqual([]);
  });

  it('配置删除后回退默认常量', async () => {
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, CFG_KEY));
    resetFinanceRulesCache();
    expect(await getManualTopupMaxAmount()).toBe(MANUAL_TOPUP_MAX_AMOUNT);
    const approval = await getApprovalRules();
    expect(approval.singleReviewMax).toBe(APPROVAL_LEVEL1_MAX);
    expect(approval.superReviewThreshold).toBe(APPROVAL_LEVEL2_MAX);
    const limits = await getCreditLimits();
    expect(limits.softLimit).toBe(CREDIT_SOFT_LIMIT);
    expect(limits.hardLimit).toBe(CREDIT_HARD_LIMIT);
  });

  it('JSON 损坏 → 回退默认（不抛错）', async () => {
    await db.insert(schema.systemConfig).values({ key: CFG_KEY, value: '{broken json', description: 'corrupt' })
      .onConflictDoUpdate({ target: schema.systemConfig.key, set: { value: '{broken json', description: 'corrupt' } });
    resetFinanceRulesCache();
    expect(await getManualTopupMaxAmount()).toBe(MANUAL_TOPUP_MAX_AMOUNT);
    expect((await getApprovalRules()).singleReviewMax).toBe(APPROVAL_LEVEL1_MAX);
  });
});

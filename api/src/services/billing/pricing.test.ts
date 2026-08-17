/**
 * 六层定价解析（P2-1）测试 — L5 活动价 / L4 分组价 / L3 代理价 / L2 模型覆盖价 / L1 平台标准价
 *
 * 依赖真实 PG（threecloud_v3），与 pre-consume.test.ts 同风格：每个用例使用唯一
 * 模型名/邮箱/活动名，测试间互不污染；不依赖 Redis（定价服务无 Redis 依赖）。
 *
 * 覆盖 docs/iteration-plan-v2.md P2-1 测试要求：
 *   1. L5 活动价：进行中（active + startAt≤now≤endAt）命中；未开始/已结束/draft 不生效 → 降级
 *   2. L5 模型级覆盖优先于全局 discount
 *   3. L4 分组价：用户组 pricingGroup='vip' 且存在 vip 组价 → 命中；无组价记录 → 降级
 *   4. L3 代理价：绑定代理的用户命中折扣；未绑定 → 降级
 *   5. 优先级：L5 存在时 L4/L3/L2 不生效；L5 未配置该模型时依次降级
 *   6. L1 兜底：全部未命中 → 默认价
 *   7. 兼容：不传 ctx（旧调用）行为与原实现一致
 *   8. computeCost / computeEstimatedCost 回归不受影响
 *
 * @see docs/iteration-plan-v2.md P2-1
 * @module services/billing
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db, schema } from '../../db';
import { and, eq, like, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import {
  getPricingForModel,
  computeCost,
  computeEstimatedCost,
  computeTaskCost,
  buildPricingContext,
  parseCampaignPricing,
  AGENT_LEVEL_DISCOUNT_RATE,
  DEFAULT_INPUT_PRICE,
  DEFAULT_OUTPUT_PRICE,
} from './pricing';

// ============================================================
// 测试夹具
// ============================================================

/** 本用例创建的活动 id（afterEach 清理，避免全局 discount 活动泄漏到后续用例） */
let createdCampaignIds: number[] = [];

beforeAll(async () => {
  // 清理历史运行残留的活动（name='camp-*' 且 type='model_pricing' 均为本测试文件创建；
  // 活动 CRUD 尚未实现、无种子数据，不存在合法活动数据被误删的风险）
  await db.delete(schema.campaigns)
    .where(and(like(schema.campaigns.name, 'camp-%'), eq(schema.campaigns.type, 'model_pricing')));
});

afterEach(async () => {
  if (createdCampaignIds.length > 0) {
    await db.delete(schema.campaigns).where(inArray(schema.campaigns.id, createdCampaignIds));
    createdCampaignIds = [];
  }
});

/** 生成唯一后缀（模型名 / 邮箱 / 活动名用，避免测试间污染） */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 创建用户，返回 userId */
async function createUser(prefix = 'user'): Promise<number> {
  const email = `${prefix}-${uid()}@test.com`;
  const [user] = await db.insert(schema.users).values({
    email,
    passwordHash: bcrypt.hashSync('Test1234!', 12),
    name: 'Pricing Test',
    role: 'customer',
    status: 'active',
  }).returning({ id: schema.users.id });
  return user!.id;
}

/** 模型名 → supplierModelId（同模型多组价复用同一供应商/模型行，避免 suppliers.name 唯一冲突） */
const modelSupplierModelIds = new Map<string, number>();

/** 建供应商 + 模型（每模型一次）+ 定价记录（可对同一模型建多个 pricing_group） */
async function createModelPricing(model: string, input: string, output: string, group = 'default'): Promise<void> {
  let modelId = modelSupplierModelIds.get(model);
  if (modelId === undefined) {
    const [sup] = await db.insert(schema.suppliers).values({
      name: `P2Sup-${model}`,
      code: `p2s-${model}`,
      baseUrl: 'https://pricing-test.example.com',
      apiType: 'openai',
      status: 'active',
    }).returning({ id: schema.suppliers.id });
    const [m] = await db.insert(schema.supplierModels).values({
      supplierId: sup!.id,
      modelName: model,
      platformModel: model,
      inputPrice: input,
      outputPrice: output,
      status: 'active',
    }).returning({ id: schema.supplierModels.id });
    modelId = m!.id;
    modelSupplierModelIds.set(model, modelId);
  }
  await db.insert(schema.vendorPricing).values({
    supplierModelId: modelId,
    pricingGroup: group,
    inputPrice: input,
    outputPrice: output,
    status: 'active',
  });
}

/** 建活动（startAt/endAt 相对 now 偏移，毫秒；config 为 campaigns.config jsonb 格式） */
async function createCampaign(config: unknown, status: string, startOffsetMs: number, endOffsetMs: number): Promise<void> {
  const [c] = await db.insert(schema.campaigns).values({
    name: `camp-${uid()}`,
    type: 'model_pricing',
    config: config as never,
    status,
    startAt: new Date(Date.now() + startOffsetMs),
    endAt: new Date(Date.now() + endOffsetMs),
  }).returning({ id: schema.campaigns.id });
  createdCampaignIds.push(c!.id);
}

/** 建用户组（指定 pricingGroup）+ 绑定用户，返回 groupId */
async function createGroupWithMember(pricingGroup: string, userId: number): Promise<number> {
  const [g] = await db.insert(schema.userGroups).values({
    name: `pg-${pricingGroup}-${uid()}`,
    pricingGroup,
    isDefault: false,
    status: 'active',
    modelWhitelist: [],
  }).returning({ id: schema.userGroups.id });
  await db.insert(schema.userGroupMemberships).values({ userId, groupId: g!.id });
  return g!.id;
}

/** 建代理（指定层级）+ 绑定客户；可指定绑定/代理状态（测试非 active 不命中） */
async function createAgentWithCustomer(
  level: 'junior' | 'senior' | 'partner',
  customerUserId: number,
  opts: { bindingStatus?: string; agentStatus?: string } = {},
): Promise<void> {
  const agentUserId = await createUser(`agent-${level}`);
  const [agent] = await db.insert(schema.agents).values({
    userId: agentUserId,
    level,
    commissionRate: '10.00',
    status: opts.agentStatus ?? 'active',
  }).returning({ id: schema.agents.id });
  await db.insert(schema.agentCustomers).values({
    agentId: agent!.id,
    customerUserId,
    status: opts.bindingStatus ?? 'active',
    source: 'report',
  });
}

// ============================================================
// 1. parseCampaignPricing — 活动价配置解析（纯函数）
// ============================================================

describe('parseCampaignPricing — 活动价配置解析（纯函数）', () => {
  it('模型级覆盖 → { kind: "model" }', () => {
    expect(parseCampaignPricing({ pricing: { models: { 'gpt-4o': { input: 1.5, output: 4.5 } } } }, 'gpt-4o'))
      .toEqual({ kind: 'model', input: 1.5, output: 4.5 });
  });

  it('全局折扣 → { kind: "discount" }', () => {
    expect(parseCampaignPricing({ pricing: { discount: 0.8 } }, 'gpt-4o'))
      .toEqual({ kind: 'discount', discount: 0.8 });
  });

  it('模型级覆盖优先于全局折扣（两者并存）', () => {
    expect(parseCampaignPricing({ pricing: { models: { 'gpt-4o': { input: 1.2, output: 3.6 } }, discount: 0.5 } }, 'gpt-4o'))
      .toEqual({ kind: 'model', input: 1.2, output: 3.6 });
  });

  it('未配置 pricing 键 / config 非对象 → null', () => {
    expect(parseCampaignPricing({ bonus: 10 }, 'gpt-4o')).toBeNull();
    expect(parseCampaignPricing(null, 'gpt-4o')).toBeNull();
    expect(parseCampaignPricing('x', 'gpt-4o')).toBeNull();
    expect(parseCampaignPricing({}, 'gpt-4o')).toBeNull();
  });

  it('模型级数值非法 → 回退全局折扣；两者皆非法 → null', () => {
    expect(parseCampaignPricing({ pricing: { models: { 'gpt-4o': { input: 0, output: 4.5 } }, discount: 0.8 } }, 'gpt-4o'))
      .toEqual({ kind: 'discount', discount: 0.8 });
    expect(parseCampaignPricing({ pricing: { models: { 'gpt-4o': { input: 'x', output: 4.5 } } } }, 'gpt-4o')).toBeNull();
  });

  it('discount 非法（0/负数/超 1/非数字）→ null；1 合法（显式不打折）', () => {
    for (const bad of [0, -0.5, 1.5, NaN, 'x', null]) {
      expect(parseCampaignPricing({ pricing: { discount: bad } }, 'gpt-4o')).toBeNull();
    }
    expect(parseCampaignPricing({ pricing: { discount: 1 } }, 'gpt-4o')).toEqual({ kind: 'discount', discount: 1 });
  });
});

// ============================================================
// 2. buildPricingContext — 请求上下文构建（纯函数）
// ============================================================

describe('buildPricingContext — 请求上下文构建（纯函数）', () => {
  it('apiKeyContext.userId（网关 API Key 鉴权）→ { userId }', () => {
    expect(buildPricingContext({ apiKeyContext: { userId: 7 } })).toEqual({ userId: 7 });
  });

  it('userContext.userId（JWT 鉴权）→ { userId }', () => {
    expect(buildPricingContext({ userContext: { userId: 8 } })).toEqual({ userId: 8 });
  });

  it('apiKeyContext 优先于 userContext', () => {
    expect(buildPricingContext({ apiKeyContext: { userId: 1 }, userContext: { userId: 2 } })).toEqual({ userId: 1 });
  });

  it('无身份 → {}；非对象 → {}', () => {
    expect(buildPricingContext({})).toEqual({});
    expect(buildPricingContext(null)).toEqual({});
    expect(buildPricingContext('x')).toEqual({});
  });

  it('同一请求对象 → 同一 ctx（记忆化，配合惰性解析保证每请求只查一次）', () => {
    const req = { apiKeyContext: { userId: 9 } };
    expect(buildPricingContext(req)).toBe(buildPricingContext(req));
  });
});

// ============================================================
// 3. L5 活动价
// ============================================================

describe('L5 活动价', () => {
  it('进行中活动（active + startAt≤now≤endAt）+ 模型级覆盖 → 活动价', async () => {
    const model = `l5-hit-${uid()}`;
    await createModelPricing(model, '0.002', '0.008'); // L2 对照
    await createCampaign({ pricing: { models: { [model]: { input: 1.5, output: 4.5 } } } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model);
    expect(p.input).toBe(1.5);
    expect(p.output).toBe(4.5);
    expect(p.cacheDiscountRate).toBeNull();
  });

  it('模型级覆盖优先于全局 discount（同时配置时用覆盖价）', async () => {
    const model = `l5-prio-${uid()}`;
    await createModelPricing(model, '0.002', '0.008');
    await createCampaign({ pricing: { models: { [model]: { input: 1.2, output: 3.6 } }, discount: 0.5 } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model);
    expect(p.input).toBe(1.2); // 覆盖价，而非 0.5×基价
    expect(p.output).toBe(3.6);
  });

  it('仅全局 discount → L2 基价 × discount', async () => {
    const model = `l5-disc-${uid()}`;
    await createModelPricing(model, '0.004', '0.012');
    await createCampaign({ pricing: { discount: 0.8 } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model);
    expect(p.input).toBeCloseTo(0.004 * 0.8, 10);
    expect(p.output).toBeCloseTo(0.012 * 0.8, 10);
  });

  it('仅全局 discount 且无 L2 记录 → L1 默认价 × discount', async () => {
    const model = `l5-disc-l1-${uid()}`;
    await createCampaign({ pricing: { discount: 0.8 } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model);
    expect(p.input).toBeCloseTo(DEFAULT_INPUT_PRICE * 0.8, 10);
    expect(p.output).toBeCloseTo(DEFAULT_OUTPUT_PRICE * 0.8, 10);
  });

  it('未开始（startAt > now）→ 不生效，降级 L2', async () => {
    const model = `l5-notstart-${uid()}`;
    await createModelPricing(model, '0.005', '0.015');
    await createCampaign({ pricing: { models: { [model]: { input: 9, output: 9 } } } }, 'active', 3600_000, 7200_000);
    const p = await getPricingForModel(model);
    expect(p.input).toBe(0.005);
    expect(p.output).toBe(0.015);
  });

  it('已结束（endAt < now）→ 不生效，降级 L2', async () => {
    const model = `l5-ended-${uid()}`;
    await createModelPricing(model, '0.005', '0.015');
    await createCampaign({ pricing: { models: { [model]: { input: 9, output: 9 } } } }, 'active', -7200_000, -3600_000);
    const p = await getPricingForModel(model);
    expect(p.input).toBe(0.005);
  });

  it('status=draft → 不生效，降级 L2', async () => {
    const model = `l5-draft-${uid()}`;
    await createModelPricing(model, '0.005', '0.015');
    await createCampaign({ pricing: { models: { [model]: { input: 9, output: 9 } } } }, 'draft', -3600_000, 3600_000);
    const p = await getPricingForModel(model);
    expect(p.input).toBe(0.005);
  });

  it('进行中但未配置该模型（models 无此项且无 discount）→ 不生效，降级', async () => {
    const model = `l5-nocover-${uid()}`;
    await createModelPricing(model, '0.005', '0.015');
    await createCampaign({ pricing: { models: { 'other-model': { input: 9, output: 9 } } } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model);
    expect(p.input).toBe(0.005);
  });
});

// ============================================================
// 4. L4 分组价
// ============================================================

describe('L4 分组价', () => {
  it('用户组 pricingGroup="vip" 且存在 vip 组价 → 命中组价', async () => {
    const model = `l4-hit-${uid()}`;
    const userId = await createUser('l4');
    await createModelPricing(model, '0.002', '0.008');      // default 组价（对照）
    await createModelPricing(model, '0.03', '0.09', 'vip'); // vip 组价
    await createGroupWithMember('vip', userId);
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBe(0.03);
    expect(p.output).toBe(0.09);
    expect(p.cacheDiscountRate).toBeNull();
  });

  it('用户组有 vip 但无 vip 组价记录 → 降级 L2', async () => {
    const model = `l4-miss-${uid()}`;
    const userId = await createUser('l4');
    await createModelPricing(model, '0.005', '0.015'); // 仅 default 组价
    await createGroupWithMember('vip', userId);
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBe(0.005);
    expect(p.output).toBe(0.015);
  });

  it('无分组绑定 → L4 不命中，降级 L2', async () => {
    const model = `l4-nogroup-${uid()}`;
    const userId = await createUser('l4');
    await createModelPricing(model, '0.005', '0.015');
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBe(0.005);
  });

  it('ctx.groupId 预解析传入 → 命中该组价（无需 membership 查询）', async () => {
    const model = `l4-gid-${uid()}`;
    const userId = await createUser('l4');
    await createModelPricing(model, '0.002', '0.008');
    await createModelPricing(model, '0.04', '0.12', 'gold');
    const groupId = await createGroupWithMember('gold', userId);
    const p = await getPricingForModel(model, { userId, groupId });
    expect(p.input).toBe(0.04);
    expect(p.output).toBe(0.12);
  });
});

// ============================================================
// 5. L3 代理价
// ============================================================

describe('L3 代理价', () => {
  it('绑定 partner 代理 → L2 基价 × 0.85', async () => {
    const model = `l3-partner-${uid()}`;
    const userId = await createUser('l3');
    await createModelPricing(model, '0.004', '0.012');
    await createAgentWithCustomer('partner', userId);
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBeCloseTo(0.004 * AGENT_LEVEL_DISCOUNT_RATE.partner!, 10);
    expect(p.output).toBeCloseTo(0.012 * AGENT_LEVEL_DISCOUNT_RATE.partner!, 10);
    expect(p.cacheDiscountRate).toBeNull();
  });

  it('junior/senior 折扣率与映射常量一致（junior 0.95 / senior 0.9 / partner 0.85）', async () => {
    expect(AGENT_LEVEL_DISCOUNT_RATE).toEqual({ junior: 0.95, senior: 0.9, partner: 0.85 });
    // senior 绑定 → 0.9 折
    const model = `l3-senior-${uid()}`;
    const userId = await createUser('l3');
    await createModelPricing(model, '0.004', '0.012');
    await createAgentWithCustomer('senior', userId);
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBeCloseTo(0.004 * 0.9, 10);
  });

  it('未绑定代理 → 降级 L2', async () => {
    const model = `l3-none-${uid()}`;
    const userId = await createUser('l3');
    await createModelPricing(model, '0.005', '0.015');
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBe(0.005);
    expect(p.output).toBe(0.015);
  });

  it('绑定非 active（agent_customers.status ≠ active）→ 不命中，降级', async () => {
    const model = `l3-inactive-${uid()}`;
    const userId = await createUser('l3');
    await createModelPricing(model, '0.005', '0.015');
    await createAgentWithCustomer('partner', userId, { bindingStatus: 'inactive' });
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBe(0.005);
  });

  it('ctx.agentId 预解析传入 → 同样命中代理折扣', async () => {
    const model = `l3-aid-${uid()}`;
    const userId = await createUser('l3');
    await createModelPricing(model, '0.004', '0.012');
    const agentUserId = await createUser('agent-direct');
    const [agent] = await db.insert(schema.agents).values({
      userId: agentUserId, level: 'partner', commissionRate: '10.00', status: 'active',
    }).returning({ id: schema.agents.id });
    const p = await getPricingForModel(model, { userId, agentId: agent!.id });
    expect(p.input).toBeCloseTo(0.004 * 0.85, 10);
    expect(p.output).toBeCloseTo(0.012 * 0.85, 10);
  });
});

// ============================================================
// 6. 优先级 L5 > L4 > L3 > L2 > L1
// ============================================================

describe('优先级 L5 > L4 > L3 > L2 > L1', () => {
  it('L5 命中时 L4/L3/L2 不生效（用户同时具备 vip 组 + 代理绑定）', async () => {
    const model = `pri-l5-${uid()}`;
    const userId = await createUser('pri');
    await createModelPricing(model, '0.005', '0.015');       // L2
    await createModelPricing(model, '0.03', '0.09', 'vip');  // L4
    await createGroupWithMember('vip', userId);
    await createAgentWithCustomer('partner', userId);          // L3
    await createCampaign({ pricing: { models: { [model]: { input: 1.5, output: 4.5 } } } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBe(1.5);
    expect(p.output).toBe(4.5);
  });

  it('L5 未配置该模型 → L4 分组价生效', async () => {
    const model = `pri-l4-${uid()}`;
    const userId = await createUser('pri');
    await createModelPricing(model, '0.005', '0.015');
    await createModelPricing(model, '0.03', '0.09', 'vip');
    await createGroupWithMember('vip', userId);
    await createAgentWithCustomer('partner', userId);
    await createCampaign({ pricing: { models: { 'zzz-not-this': { input: 9, output: 9 } } } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBe(0.03);
    expect(p.output).toBe(0.09);
  });

  it('L5/L4 未命中该模型（vip 组无该模型组价）→ L3 代理折扣生效', async () => {
    const model = `pri-l3-${uid()}`;
    const userId = await createUser('pri');
    await createModelPricing(model, '0.005', '0.015'); // 仅 default
    await createGroupWithMember('vip', userId);        // vip 组但无 vip 组价
    await createAgentWithCustomer('partner', userId);
    await createCampaign({ pricing: { models: { 'zzz-not-this': { input: 9, output: 9 } } } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBeCloseTo(0.005 * 0.85, 10);
    expect(p.output).toBeCloseTo(0.015 * 0.85, 10);
  });

  it('L5/L4/L3 未命中 → L2 模型覆盖价', async () => {
    const model = `pri-l2-${uid()}`;
    const userId = await createUser('pri');
    await createModelPricing(model, '0.005', '0.015');
    await createCampaign({ pricing: { models: { 'zzz-not-this': { input: 9, output: 9 } } } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBe(0.005);
    expect(p.output).toBe(0.015);
  });

  it('全部未命中 → L1 平台标准价', async () => {
    const model = `pri-l1-${uid()}`;
    const userId = await createUser('pri');
    await createCampaign({ pricing: { models: { 'zzz-not-this': { input: 9, output: 9 } } } }, 'active', -3600_000, 3600_000);
    const p = await getPricingForModel(model, { userId });
    expect(p.input).toBe(DEFAULT_INPUT_PRICE);
    expect(p.output).toBe(DEFAULT_OUTPUT_PRICE);
    expect(p.cacheDiscountRate).toBeNull();
  });
});

// ============================================================
// 7. L1 平台标准价兜底
// ============================================================

describe('L1 平台标准价兜底', () => {
  it('无任何定价记录 → 默认价', async () => {
    const model = `l1-${uid()}`;
    const p = await getPricingForModel(model);
    expect(p.input).toBe(DEFAULT_INPUT_PRICE);
    expect(p.output).toBe(DEFAULT_OUTPUT_PRICE);
    expect(p.cacheDiscountRate).toBeNull();
  });
});

// ============================================================
// 8. 兼容：不传 ctx（旧调用）
// ============================================================

describe('兼容：不传 ctx（旧调用行为与原来完全一致）', () => {
  it('default 组价存在 → 返回 L2 单价（与原实现一致）', async () => {
    const model = `compat-${uid()}`;
    await createModelPricing(model, '0.005', '0.015');
    const p = await getPricingForModel(model);
    expect(p.input).toBe(0.005);
    expect(p.output).toBe(0.015);
  });

  it('无记录 → L1 默认价', async () => {
    const p = await getPricingForModel(`compat-none-${uid()}`);
    expect(p.input).toBe(DEFAULT_INPUT_PRICE);
    expect(p.output).toBe(DEFAULT_OUTPUT_PRICE);
  });

  it('传空对象 ctx → 与不传等价（不启用 L4/L3）', async () => {
    const model = `compat-empty-${uid()}`;
    const userId = await createUser('compat');
    await createModelPricing(model, '0.005', '0.015');
    await createModelPricing(model, '0.03', '0.09', 'vip'); // vip 组价存在
    await createGroupWithMember('vip', userId);
    await createAgentWithCustomer('partner', userId);
    // 空 ctx（无 userId）→ 不解析 L4/L3，直接 L2
    const p = await getPricingForModel(model, {});
    expect(p.input).toBe(0.005);
  });
});

// ============================================================
// 9. computeCost / computeEstimatedCost / computeTaskCost 回归
// ============================================================

describe('computeCost / computeEstimatedCost / computeTaskCost 回归', () => {
  it('computeCost = input/1000×inputPrice + output/1000×outputPrice', () => {
    expect(computeCost('m', 1000, 2000, { input: 0.002, output: 0.008 })).toBeCloseTo(0.002 + 0.016, 10);
    expect(computeCost('m', 0, 0)).toBe(0);
  });

  it('L5 活动价参与 computeCost（费用按活动价计算）', async () => {
    const model = `cost-l5-${uid()}`;
    await createCampaign({ pricing: { models: { [model]: { input: 1.5, output: 4.5 } } } }, 'active', -3600_000, 3600_000);
    const pricing = await getPricingForModel(model);
    const cost = computeCost(model, 1000, 1000, pricing);
    expect(cost).toBeCloseTo(1.5 + 4.5, 10);
  });

  it('computeEstimatedCost 输出 token 封顶（max_tokens 超上限截断；未传用默认上限）', () => {
    const est = computeEstimatedCost('m', 1000, { input: 0.002, output: 0.008 }, 10000);
    expect(est).toBeCloseTo((1000 / 1000) * 0.002 + (4096 / 1000) * 0.008, 10);
    const estDefault = computeEstimatedCost('m', 0, { input: 0.002, output: 0.008 });
    expect(estDefault).toBeCloseTo((4096 / 1000) * 0.008, 10);
  });

  it('computeTaskCost = 模型 outputPrice（1 次任务 = 1000 output tokens）', () => {
    expect(computeTaskCost('m', { input: 0.002, output: 0.008 })).toBeCloseTo(0.008, 10);
  });
});

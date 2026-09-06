/**
 * 用户引导（Onboarding）端点 — /api/v1/me/onboarding/*
 *
 * 对齐 docs/SPEC-§18-用户端体验增强.md §18.3 用户引导 + web-console OnboardingWizard.tsx：
 *   GET  /api/v1/me/onboarding/status    — 当前引导状态（{ status, step, completedAt }）
 *   POST /api/v1/me/onboarding/step      — 保存已完成的步骤（body { step: number }）
 *   POST /api/v1/me/onboarding/skip      — 跳过引导
 *   POST /api/v1/me/onboarding/complete  — 完成引导
 *
 * status 枚举：not_started | in_progress | completed | skipped（与 OnboardingWizard 一致）。
 * 持久化：按用户写入 system_config，key = `onboarding.<uid>`，value = JSON.stringify({ status, step, completedAt })。
 * 采用 system_config（零迁移，遵循既有用户细化状态的通知偏好 notif_pref.<uid>.prefs 先例），
 * 不新增 users 表列、不需要迁移，避免 live DB 三cloud_v3 schema 漂移。
 *
 * 响应形状注意：OnboardingWizard GET 直接返回 res.data 作为 OnboardingStatus
 * （{ status, step, completedAt }），因此 status 端点的 HTTP body 就是该对象（无 data 包裹，
 * 以满足前端既有契约）；POST 端点响应前端不消费，统一回 { data: { ok, ... } }。
 *
 * @module routes/me-onboarding
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import { UnauthorizedError, ValidationError } from '../lib/errors.js';

export type OnboardingStatusValue = 'not_started' | 'in_progress' | 'completed' | 'skipped';

interface OnboardingState {
  status: OnboardingStatusValue;
  step: number;
  completedAt: string | null;
}

/**
 * 引导步骤总数（OnboardingWizard.tsx 定义 5 步，步骤为 1-based）。
 * completed 时回填为最后一步，保证 step 恒 <= TOTAL_STEPS。
 */
const ONBOARDING_TOTAL_STEPS = 5;

/** 用户引导存储键 */
function onboardingKey(uid: number): string {
  return `onboarding.${uid}`;
}

/** 默认引导状态（未初始化 / 数据损坏时兜底） */
function defaultOnboardingState(): OnboardingState {
  return { status: 'not_started', step: 1, completedAt: null };
}

/** 读取当前用户引导状态（缺失/解析失败 → 默认 not_started） */
async function readOnboarding(uid: number): Promise<OnboardingState> {
  const rows = await db
    .select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, onboardingKey(uid)))
    .limit(1);
  if (!rows[0]) return defaultOnboardingState();
  try {
    const parsed = JSON.parse(rows[0].value) as Partial<OnboardingState>;
    if (parsed && typeof parsed === 'object' && typeof parsed.status === 'string') {
      const status = parsed.status as OnboardingStatusValue;
      if (['not_started', 'in_progress', 'completed', 'skipped'].includes(status)) {
        const step = Number.isInteger(parsed.step) && (parsed.step as number) >= 1 ? (parsed.step as number) : 1;
        return {
          status,
          step: Math.min(step, ONBOARDING_TOTAL_STEPS),
          completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
        };
      }
    }
  } catch {
    /* 数据损坏 → 走默认 */
  }
  return defaultOnboardingState();
}

/** upsert 引导状态到 system_config（对齐 notif_pref 的 onConflictDoUpdate 模式） */
async function writeOnboarding(uid: number, state: OnboardingState): Promise<OnboardingState> {
  await db
    .insert(schema.systemConfig)
    .values({
      key: onboardingKey(uid),
      value: JSON.stringify(state),
      description: `用户 ${uid} 的引导状态`,
      updatedBy: uid,
    })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: { value: JSON.stringify(state), updatedBy: uid, updatedAt: new Date() },
    });
  return state;
}

/* ───────── 鉴权（对齐 me-gap.ts jwtAuth 模式） ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

function userId(request: any): number {
  return (request as any).userContext.userId;
}

export async function meOnboardingRoutes(app: FastifyInstance) {
  /** GET /api/v1/me/onboarding/status — 当前引导状态 */
  app.get('/api/v1/me/onboarding/status', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const state = await readOnboarding(uid);
    return reply.send(state);
  });

  /** POST /api/v1/me/onboarding/step — 保存已完成的步骤（body { step: number }） */
  app.post('/api/v1/me/onboarding/step', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const rawStep = Number(body.step);
    if (!Number.isInteger(rawStep) || rawStep < 1) throw new ValidationError('step 必须是 >=1 的整数');
    const step = Math.min(rawStep, ONBOARDING_TOTAL_STEPS);

    const current = await readOnboarding(uid);
    // 已跳过 → 重新进行；已完成后不再回退 in_progress
    const status: OnboardingStatusValue =
      current.status === 'completed' ? 'completed' : 'in_progress';
    const state = await writeOnboarding(uid, {
      status,
      step,
      completedAt: current.completedAt,
    });
    return reply.send({ data: { ok: true, status: state.status, step: state.step } });
  });

  /** POST /api/v1/me/onboarding/skip — 跳过引导 */
  app.post('/api/v1/me/onboarding/skip', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const current = await readOnboarding(uid);
    const state = await writeOnboarding(uid, {
      status: 'skipped',
      step: current.step,
      completedAt: new Date().toISOString(),
    });
    return reply.send({ data: { ok: true, status: state.status } });
  });

  /** POST /api/v1/me/onboarding/complete — 完成引导 */
  app.post('/api/v1/me/onboarding/complete', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const state = await writeOnboarding(uid, {
      status: 'completed',
      step: ONBOARDING_TOTAL_STEPS,
      completedAt: new Date().toISOString(),
    });
    return reply.send({ data: { ok: true, status: state.status } });
  });
}
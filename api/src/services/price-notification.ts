/**
 * 价格变更通知引擎
 *
 * 职责：
 *   - 影响评分计算（|变动率| × 用户近30天消费占比 × 可替代性系数）
 *   - 三级通知级别判定（A 紧急 / B 周报 / C 静默）
 *   - 每小时分发未分发变更（站内信 + A 级邮件）
 *   - 每周一 08:00 生成 B 级周报
 *   - 常驻调度器（随 API 进程启动）
 *
 * 数据口径：
 *   - 变更源：vendor_pricing 销售价（suppliers.ts 写入 price_change_logs）
 *   - 用户模型消费占比：consumption_records.model = supplier_models.model_name
 *   - 可替代性：同类 = 活跃 supplier_models 中 model_name 相同数量（跨供应商同模型）
 */

import { db, schema } from '../db';
import { eq, and, gte, lte, isNull, desc, sql, inArray } from 'drizzle-orm';
import { sendMail, getSmtpConfig } from './mailer';

/* ────────────────────────────────────────────────
 * 常量与类型
 * ──────────────────────────────────────────────── */

export type Tier = 'A' | 'B' | 'C';

export interface ModelInfo {
  modelId: number;
  modelName: string;
  supplierId: number;
  supplierName: string;
}

export interface EvaluatedUser {
  userId: number;
  email: string;
  share: number;       // 0-1
  coefficient: number; // 有效可替代性系数
  score: number;       // 影响评分
  tier: Tier;
  channel: string;     // in_app / in_app+email / none
}

export interface EvaluationResult {
  model: ModelInfo;
  oldSalePrice: number;
  newSalePrice: number;
  changeRate: number;      // 带符号百分比
  effectiveAt: Date;
  autoCoefficient: number;
  effectiveCoefficient: number;
  coefficientBasis: string;
  total: number;
  tierCounts: { A: number; B: number; C: number };
  rows: EvaluatedUser[];
}

/* ────────────────────────────────────────────────
 * 可替代性系数
 * ──────────────────────────────────────────────── */

/** 基础值：同类模型数（同一 model_name 的活跃供应商模型数） */
function baseCoefficient(peerCount: number): number {
  if (peerCount >= 8) return 1.5;
  if (peerCount >= 5) return 1.2;
  if (peerCount >= 2) return 1.0;
  return 0.5;
}

export async function computeSubstitutability(modelId: number, modelName: string) {
  const [auto] = await db.select({ value: sql<number>`count(*)::int` })
    .from(schema.supplierModels)
    .where(and(eq(schema.supplierModels.modelName, modelName), eq(schema.supplierModels.status, 'active')));
  const peerCount = Number(auto?.value ?? 1);
  const autoCoefficient = baseCoefficient(peerCount);

  const [override] = await db.select({
    manualCoefficient: schema.modelSubstitutability.manualCoefficient,
    manualReason: schema.modelSubstitutability.manualReason,
  })
    .from(schema.modelSubstitutability)
    .where(eq(schema.modelSubstitutability.modelId, modelId))
    .limit(1);

  const manual = override?.manualCoefficient != null ? Number(override.manualCoefficient) : null;
  const effective = clamp(manual ?? autoCoefficient, 0.3, 2.0);
  const basis = manual != null
    ? `手动覆盖 ${manual}（原因：${override?.manualReason || '-'}）`
    : `同类活跃模型 ${peerCount} 个 → 基础值 ${autoCoefficient}`;

  return { autoCoefficient, effectiveCoefficient: effective, coefficientBasis: basis, peerCount, manual };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/* ────────────────────────────────────────────────
 * 用户消费占比（近 30 天）
 * ──────────────────────────────────────────────── */

interface UserShare {
  userId: number;
  share: number;   // 0-1
  active90: boolean;
}

async function computeUserShares(modelName: string): Promise<UserShare[]> {
  // 用 ISO 字符串传参（postgres-js 的 db.execute(sql...) 预处理路径不接受 Date 参数）
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const since90 = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();

  // 近 30 天每个活跃客户的总消费
  const totals = await db.execute(sql`
    SELECT cr.user_id, COALESCE(SUM(cr.cost::numeric), 0)::float AS total
    FROM consumption_records cr
    WHERE cr.created_at >= ${since30}
    GROUP BY cr.user_id
  `);
  // 近 30 天该模型消费
  const modelCosts = await db.execute(sql`
    SELECT cr.user_id, COALESCE(SUM(cr.cost::numeric), 0)::float AS cost
    FROM consumption_records cr
    WHERE cr.created_at >= ${since30} AND cr.model = ${modelName}
    GROUP BY cr.user_id
  `);
  // 近 90 天是否活跃（区分 90 天静默用户）
  const active90 = await db.execute(sql`
    SELECT DISTINCT cr.user_id FROM consumption_records cr WHERE cr.created_at >= ${since90}
  `);
  const active90Set = new Set((active90 as any[]).map((r) => Number(r.user_id)));

  const totalMap = new Map((totals as any[]).map((r) => [Number(r.user_id), Number(r.total)]));
  const modelMap = new Map((modelCosts as any[]).map((r) => [Number(r.user_id), Number(r.cost)]));

  // 合并所有出现过的用户（总消费用户 ∪ 模型消费用户）
  const userIds = new Set<number>([...totalMap.keys(), ...modelMap.keys()]);
  const out: UserShare[] = [];
  for (const uid of userIds) {
    const total = totalMap.get(uid) ?? 0;
    const cost = modelMap.get(uid) ?? 0;
    out.push({
      userId: uid,
      share: total > 0 ? cost / total : 0,
      active90: active90Set.has(uid),
    });
  }
  return out;
}

/* ────────────────────────────────────────────────
 * 通知级别判定
 * ──────────────────────────────────────────────── */

export function decideTier(opts: {
  changeRate: number;   // 带符号百分比
  oldSalePrice: number;
  newSalePrice: number;
  score: number;
  active90: boolean;
}): { tier: Tier; channel: string; isFreeFlip: boolean } {
  const { changeRate, oldSalePrice, newSalePrice, score, active90 } = opts;
  const absRate = Math.abs(changeRate);

  // 变动率 < 5% → 静默（AC7）
  if (absRate < 5) return { tier: 'C', channel: 'none', isFreeFlip: false };

  // 免费↔付费 → 强制 A
  const freeFlip = (oldSalePrice === 0) !== (newSalePrice === 0);
  if (freeFlip) return { tier: 'A', channel: 'in_app+email', isFreeFlip: true };

  // 90 天无调用 → 静默（AC6/AC12）
  if (!active90) return { tier: 'C', channel: 'none', isFreeFlip: false };

  if (score > 8) return { tier: 'A', channel: 'in_app+email', isFreeFlip: false };
  if (score >= 3) return { tier: 'B', channel: 'in_app', isFreeFlip: false };
  if (absRate > 20) return { tier: 'B', channel: 'in_app', isFreeFlip: false };
  return { tier: 'C', channel: 'none', isFreeFlip: false };
}

/* ────────────────────────────────────────────────
 * 评估（impact 接口与分发共用）
 * ──────────────────────────────────────────────── */

export async function evaluateLog(changeLogId: number): Promise<EvaluationResult> {
  const [log] = await db.select().from(schema.priceChangeLogs)
    .where(eq(schema.priceChangeLogs.id, changeLogId))
    .limit(1);
  if (!log) throw new Error(`price_change_log ${changeLogId} not found`);

  const [model] = await db.select({
    modelId: schema.supplierModels.id,
    modelName: schema.supplierModels.modelName,
    supplierId: schema.supplierModels.supplierId,
    supplierName: schema.suppliers.name,
  })
    .from(schema.supplierModels)
    .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
    .where(eq(schema.supplierModels.id, log.supplierModelId))
    .limit(1);
  if (!model) throw new Error(`supplier_model ${log.supplierModelId} not found`);

  const oldSalePrice = Number(log.oldSalePrice ?? log.oldOutputPrice ?? 0);
  const newSalePrice = Number(log.newSalePrice ?? log.newOutputPrice ?? 0);
  const changeRate = Number(log.changeRate ?? 0);

  const sub = await computeSubstitutability(model.modelId, model.modelName);
  const shares = await computeUserShares(model.modelName);

  // 拉取用户邮箱
  const userIds = shares.map((s) => s.userId);
  const userMap = new Map<number, string>();
  if (userIds.length > 0) {
    const users = await db.select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds));
    for (const u of users) userMap.set(u.id, u.email);
  }

  const rateAbs = Math.abs(changeRate) / 100; // 0.214
  const rows: EvaluatedUser[] = shares.map((s) => {
    const score = rateAbs * s.share * sub.effectiveCoefficient;
    const decision = decideTier({ changeRate, oldSalePrice, newSalePrice, score, active90: s.active90 });
    return {
      userId: s.userId,
      email: userMap.get(s.userId) ?? '',
      share: s.share,
      coefficient: sub.effectiveCoefficient,
      score: Number(score.toFixed(2)),
      tier: decision.tier,
      channel: decision.channel,
    };
  });

  rows.sort((a, b) => b.score - a.score);

  const tierCounts = { A: 0, B: 0, C: 0 };
  for (const r of rows) tierCounts[r.tier]++;

  return {
    model: { ...model },
    oldSalePrice,
    newSalePrice,
    changeRate,
    effectiveAt: log.effectiveAt,
    autoCoefficient: sub.autoCoefficient,
    effectiveCoefficient: sub.effectiveCoefficient,
    coefficientBasis: sub.coefficientBasis,
    total: rows.length,
    tierCounts,
    rows,
  };
}

/* ────────────────────────────────────────────────
 * 通知文案
 * ──────────────────────────────────────────────── */

function priceDirection(changeRate: number) {
  return changeRate > 0 ? '上涨' : '下降';
}

function notificationTitle(modelName: string, changeRate: number) {
  const dir = changeRate > 0 ? '📈' : '📉';
  return `${dir} 模型价格${priceDirection(changeRate)}：${modelName} ${changeRate > 0 ? '+' : ''}${changeRate}%`;
}

function notificationContent(result: EvaluationResult) {
  const { model, oldSalePrice, newSalePrice, changeRate, effectiveAt } = result;
  return `模型「${model.modelName}」销售价由 ¥${oldSalePrice} 调整为 ¥${newSalePrice}（${changeRate > 0 ? '+' : ''}${changeRate}%），${priceDirection(changeRate)}。生效时间：${effectiveAt.toLocaleString('zh-CN')}。`;
}

async function findAlternatives(modelName: string, newSalePrice: number) {
  const rows = await db.execute(sql`
    SELECT DISTINCT sm.model_name AS model_name,
           (SELECT vp2.output_price::numeric FROM vendor_pricing vp2
             JOIN supplier_models sm2 ON sm2.id = vp2.supplier_model_id
             WHERE sm2.model_name = sm.model_name AND vp2.status = 'active'
             ORDER BY vp2.output_price::numeric ASC LIMIT 1) AS min_price
    FROM supplier_models sm
    JOIN vendor_pricing vp ON vp.supplier_model_id = sm.id AND vp.status = 'active'
    WHERE sm.model_name <> ${modelName} AND sm.status = 'active'
    ORDER BY min_price ASC
    LIMIT 3
  `);
  return (rows as any[]).map((r) => ({
    model_name: r.model_name,
    min_price: r.min_price != null ? Number(r.min_price) : null,
  }));
}

/* ────────────────────────────────────────────────
 * 分发（每小时任务 + 手动重发共用）
 * ──────────────────────────────────────────────── */

export async function dispatchPriceChange(changeLogId: number, opts?: { manual?: boolean }): Promise<{ dispatched: boolean; tierCounts: { A: number; B: number; C: number }; total: number }> {
  const result = await evaluateLog(changeLogId);
  const smtp = await getSmtpConfig();

  // A 级：站内信 + 邮件（SMTP 未配置则仅站内信）；B 级：仅站内信（周报汇总，sent_at 留空待周报）
  let aCount = 0, bCount = 0, cCount = 0;
  for (const row of result.rows) {
    if (row.tier === 'A') {
      aCount++;
      const content = notificationContent(result);
      const title = notificationTitle(result.model.modelName, result.changeRate);
      // 站内信
      await db.insert(schema.notifications).values({
        userId: row.userId,
        type: 'price_change',
        title,
        content,
        metadata: { price_change_log_id: changeLogId, tier: 'A', impact_score: row.score, channel: row.channel } as any,
      });
      // A 级带替代模型建议（AC10），SMTP 配置后真实发送
      if (smtp.enabled && smtp.host) {
        const alternatives = await findAlternatives(result.model.modelName, result.newSalePrice);
        const emailHtml = buildEmailHtml(title, content, alternatives);
        await sendMail({ to: row.email, subject: title, html: emailHtml, templateName: 'price_change' });
      }
    } else if (row.tier === 'B') {
      bCount++;
      await db.insert(schema.userNotifications).values({
        userId: row.userId,
        priceChangeLogId: changeLogId,
        tier: 'B',
        impactScore: String(row.score),
        title: notificationTitle(result.model.modelName, result.changeRate),
        content: notificationContent(result),
        channel: 'in_app',
        sentAt: null, // 待周报
      });
    } else {
      cCount++;
    }
  }

  await db.insert(schema.priceChangeDispatchLog).values({
    priceChangeLogId: changeLogId,
    totalUsersEvaluated: result.total,
    tierACount: aCount,
    tierBCount: bCount,
    tierCCount: cCount,
    dispatchedAt: new Date(),
  });
  await db.update(schema.priceChangeLogs)
    .set({ dispatched: true })
    .where(eq(schema.priceChangeLogs.id, changeLogId));

  return { dispatched: true, tierCounts: { A: aCount, B: bCount, C: cCount }, total: result.total };
}

function buildEmailHtml(title: string, content: string, alternatives: { model_name: string; min_price: number | null }[]) {
  const altHtml = alternatives.length > 0
    ? `<div style="margin-top:16px;padding:12px;background:#f0f7ff;border-radius:6px">
        <strong>💡 可替代模型建议</strong>
        <ul style="margin:8px 0 0">${alternatives.map((a) => `<li>${a.model_name} — ¥${a.min_price ?? '-'}/1M</li>`).join('')}</ul>
       </div>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;color:#333">
    <h2>${title}</h2>
    <p>${content}</p>
    <p style="color:#888;font-size:12px">此邮件由 3Cloud 自动发送，请勿直接回复。</p>
    ${altHtml}
  </div>`;
}

/* ────────────────────────────────────────────────
 * 每周一 08:00 周报
 * ──────────────────────────────────────────────── */

export async function generateWeeklySummary() {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const pending = await db.select({
    userId: schema.userNotifications.userId,
    title: schema.userNotifications.title,
    content: schema.userNotifications.content,
  })
    .from(schema.userNotifications)
    .where(and(
      eq(schema.userNotifications.tier, 'B'),
      eq(schema.userNotifications.isWeeklySummary, false),
      isNull(schema.userNotifications.sentAt),
      gte(schema.userNotifications.createdAt, since),
    ));

  if (pending.length === 0) return { users: 0 }; // 不发空报

  // 每用户合并一条
  const byUser = new Map<number, typeof pending>();
  for (const p of pending) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId)!.push(p);
  }

  let sent = 0;
  for (const [uid, items] of byUser) {
    const summary = `【本周价格变更汇总】\n${items.map((i) => `• ${i.title} — ${i.content}`).join('\n')}`;
    await db.insert(schema.notifications).values({
      userId: uid,
      type: 'price_change',
      title: '📊 价格变更周报',
      content: summary,
      metadata: { tier: 'B', weekly: true, count: items.length } as any,
    });
    sent++;
  }

  // 标记已汇总
  await db.update(schema.userNotifications)
    .set({ isWeeklySummary: true, sentAt: new Date() })
    .where(and(
      eq(schema.userNotifications.tier, 'B'),
      eq(schema.userNotifications.isWeeklySummary, false),
      isNull(schema.userNotifications.sentAt),
      gte(schema.userNotifications.createdAt, since),
    ));

  return { users: sent };
}

/* ────────────────────────────────────────────────
 * 常驻调度器
 * ──────────────────────────────────────────────── */

const HOUR_MS = 3600 * 1000;
const MINUTE_MS = 60 * 1000;

let schedulerStarted = false;

/** UTC+8 当前小时/分钟 */
function cstNow() {
  return new Date(Date.now() + 8 * HOUR_MS);
}

export function startPriceNotificationScheduler(log: { info: (msg: string) => void }) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  let lastDispatchHour = -1;
  let lastWeeklyDay = -1;

  const tick = async () => {
    const now = cstNow();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const day = now.getUTCDay(); // 0=周日, 1=周一
    try {
      // 每小时整点后 1 分钟分发
      if (minute >= 1 && hour !== lastDispatchHour) {
        lastDispatchHour = hour;
        log.info('🔄 [price-notify] 执行每小时分发...');
        const logs = await db.select({ id: schema.priceChangeLogs.id })
          .from(schema.priceChangeLogs)
          .where(and(
            eq(schema.priceChangeLogs.dispatched, false),
            lte(schema.priceChangeLogs.effectiveAt, new Date()),
          ));
        for (const l of logs) {
          try {
            await dispatchPriceChange(l.id);
            log.info(`  已分发变更 #${l.id}`);
          } catch (err: any) {
            log.info(`  变更 #${l.id} 分发失败: ${err.message}`);
            await db.insert(schema.priceChangeDispatchLog).values({
              priceChangeLogId: l.id,
              totalUsersEvaluated: 0,
              tierACount: 0, tierBCount: 0, tierCCount: 0,
              errorMessage: err.message,
            });
          }
        }
      }

      // 每周一 08:00 周报
      if (day === 1 && hour === 8 && minute >= 0 && minute < 2 && day !== lastWeeklyDay) {
        lastWeeklyDay = day;
        log.info('📊 [price-notify] 执行每周价格变更周报...');
        const r = await generateWeeklySummary();
        log.info(`  周报已生成，覆盖 ${r.users} 用户`);
      }
    } catch (err: any) {
      log.info(`[price-notify] tick 异常: ${err.message}`);
    }
  };

  setInterval(tick, 60 * 1000);
  log.info('⏰ 价格变更调度器已启动（每小时分发 + 周一 08:00 周报，UTC+8）');
}

/** 手动重发：允许对已分发变更再次分发 */
export async function renotifyPriceChange(changeLogId: number) {
  const [log] = await db.select().from(schema.priceChangeLogs)
    .where(eq(schema.priceChangeLogs.id, changeLogId))
    .limit(1);
  if (!log) throw new Error(`price_change_log ${changeLogId} not found`);
  return dispatchPriceChange(changeLogId, { manual: true });
}

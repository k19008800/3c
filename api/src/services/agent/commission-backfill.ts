/**
 * 佣金回填调度器 — 自愈异步佣金生成遗漏
 *
 * 实时结算走异步链路（chat.ts settleBilling 内 fire-and-forget），进程崩溃时
 * 已消费未生成佣金的记录可能丢失。本调度器常驻（随 API 进程启动），每 60s 扫描
 * 最近 24h 内「有消费记录但无 agent_commissions」的项，补生成佣金（幂等）。
 */

import { db, schema } from '../../db';
import { and, gte, sql } from 'drizzle-orm';
import { generateCommissionForConsumption } from './commission';

let schedulerStarted = false;

export function startCommissionBackfillScheduler(log: { info: (msg: string) => void; warn?: (msg: string) => void }) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    try {
      // 最近 24h 内、还没有佣金记录的消费（LEFT JOIN agent_commissions 取 null）
      const missing = await db.execute(sql`
        SELECT cr.id, cr.user_id, cr.cost
        FROM consumption_records cr
        LEFT JOIN agent_commissions ac ON ac.consumption_record_id = cr.id
        WHERE cr.created_at >= now() - interval '24 hours'
          AND ac.id IS NULL
        LIMIT 200
      `);

      for (const row of missing as unknown as Array<{ id: number; user_id: number; cost: string }>) {
        try {
          const comm = await generateCommissionForConsumption({
            userId: row.user_id,
            consumptionRecordId: row.id,
            cost: row.cost,
          });
          if (comm) log.info(`  回填佣金 consumption#${row.id} → 佣金#${comm.id}`);
        } catch (err: any) {
          log.warn?.(`  回填失败 consumption#${row.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      log.warn?.(`[commission-backfill] tick 异常: ${err.message}`);
    }
  };

  setInterval(tick, 60 * 1000);
  log.info('🔄 佣金回填调度器已启动（每 60s 扫描最近 24h 缺失佣金）');
}

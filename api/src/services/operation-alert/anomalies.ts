// ============================================================
//  3cloud (3C) — 运营异常检测服务
//  检测异常操作模式：批量删除、敏感操作、高频失败、异地管理等
// ============================================================

import { eq, and, gte, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { operationLogs } from "../../db/schema.js";

export interface OperationAlert {
  type: string; severity: 'low' | 'medium' | 'high' | 'critical';
  title: string; description: string;
  operatorId: number; operatorName?: string;
  targetType: string; targetId?: number;
  ip?: string; createdAt: string;
}

async function detectFrequentFailure(since: Date): Promise<OperationAlert[]> {
  const db = getDb(); const alerts: OperationAlert[] = [];
  const recentLogs = await db.execute(sql`
    SELECT operator_id, ip, count(*)::int as cnt
    FROM operation_logs
    WHERE created_at >= ${since} AND status = 'failed'
    GROUP BY operator_id, ip
    HAVING count(*) >= 5
    ORDER BY cnt DESC LIMIT 20
  `);
  for (const log of recentLogs.rows as any[]) {
    alerts.push({ type: 'frequent_failure', severity: 'high', title: '操作频繁失败', description: `用户 #${log.operator_id} 在短时间内有 ${log.cnt} 次操作失败记录`, operatorId: Number(log.operator_id), targetType: 'user', ip: log.ip, createdAt: new Date().toISOString() });
  }
  return alerts;
}

async function detectRemoteLogin(since: Date): Promise<OperationAlert[]> {
  const db = getDb(); const alerts: OperationAlert[] = [];
  const recentLogs = await db.execute(sql`
    WITH user_ips AS (
      SELECT operator_id, ip, count(*)::int as cnt
      FROM operation_logs
      WHERE created_at >= ${since}
      GROUP BY operator_id, ip
    ), user_ip_stats AS (
      SELECT operator_id,
        count(*)::int as ip_count,
        (SELECT array_agg(DISTINCT substring(ip from '^[0-9]+\\.[0-9]+\\.[0-9]+')) FROM user_ips u2
         WHERE u2.operator_id = user_ips.operator_id AND cnt >= 5) as subnets
      FROM user_ips WHERE cnt >= 5
      GROUP BY operator_id
    )
    SELECT * FROM user_ip_stats WHERE ip_count >= 3 AND array_length(subnets, 1) >= 2
    LIMIT 20
  `);
  for (const log of recentLogs.rows as any[]) {
    alerts.push({ type: 'remote_login', severity: 'medium', title: '多地操作', description: `用户 #${log.operator_id} 从 ${log.ip_count} 个不同 IP 进行操作`, operatorId: Number(log.operator_id), targetType: 'user', createdAt: new Date().toISOString() });
  }
  return alerts;
}

async function detectBatchDelete(since: Date): Promise<OperationAlert[]> {
  const db = getDb(); const alerts: OperationAlert[] = [];
  const recentLogs = await db.execute(sql`
    SELECT operator_id, target_type, count(*)::int as cnt,
      count(*) filter (where status = 'failed')::int as fail_cnt
    FROM operation_logs
    WHERE created_at >= ${since} AND action LIKE '%delete%'
    GROUP BY operator_id, target_type
    HAVING count(*) >= 10
    ORDER BY cnt DESC LIMIT 20
  `);
  for (const log of recentLogs.rows as any[]) {
    const failRate = (Number(log.fail_cnt) / Number(log.cnt)) * 100;
    alerts.push({ type: 'batch_delete', severity: failRate > 50 ? 'critical' : 'high', title: '批量删除操作', description: `用户 #${log.operator_id} 批量删除 ${log.target_type}（${log.cnt} 次，失败率 ${failRate.toFixed(0)}%）`, operatorId: Number(log.operator_id), targetType: log.target_type, createdAt: new Date().toISOString() });
  }
  return alerts;
}

async function detectSensitiveOperation(since: Date): Promise<OperationAlert[]> {
  const db = getDb(); const alerts: OperationAlert[] = [];
  const sensitiveActions = ['reset_password', 'update_config', 'update_system_security', 'update_user_role', 'switch_vendor'];
  const recentLogs = await db.execute(sql`
    SELECT operator_id, action, target_type, count(*)::int as cnt, ip
    FROM operation_logs WHERE created_at >= ${since}
      AND action = ANY(${sensitiveActions})
    GROUP BY operator_id, action, target_type, ip
    ORDER BY cnt DESC LIMIT 20
  `);
  for (const log of recentLogs.rows as any[]) {
    alerts.push({ type: 'sensitive_operation', severity: 'critical', title: '敏感操作', description: `用户 #${log.operator_id} 执行 ${log.action}（${log.cnt} 次）`, operatorId: Number(log.operator_id), targetType: log.target_type, ip: log.ip, createdAt: new Date().toISOString() });
  }
  return alerts;
}

export async function detectOperationAnomalies(): Promise<OperationAlert[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [failureAlerts, remoteAlerts, deleteAlerts, sensitiveAlerts] = await Promise.all([
    detectFrequentFailure(since), detectRemoteLogin(since),
    detectBatchDelete(since), detectSensitiveOperation(since),
  ]);
  const allAlerts = [...failureAlerts, ...remoteAlerts, ...deleteAlerts, ...sensitiveAlerts];
  return allAlerts;
}

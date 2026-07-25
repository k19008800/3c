// ============================================================
//  3cloud (3C) — 实时监控服务
//  监控系统关键指标：API响应时间、错误率、数据库连接、Redis健康状态
// ============================================================

import { getDb } from "../../db/index.js";
import { monitoringAlerts, monitoringRules, notificationConfig } from "../../db/schema/monitoring.js";
import { eq, and, gte, lte } from "drizzle-orm";
import { logger } from "../../logger.js";
import redisClient from "../../redis.js";
import { users } from "../../db/schema/users.js";

export interface MonitoringMetric {
  type: 'api_response_time' | 'api_error_rate' | 'database_connection' | 'redis_health' | 'disk_usage' | 'memory_usage';
  value: number;
  timestamp: Date;
}

export interface AlertRule {
  id: string;
  type: string;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  duration?: number; // 持续时间（秒）
  silencePeriod?: number; // 静默期（秒）
}

export interface AlertEvent {
  id: string;
  type: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  createdAt: Date;
}

export class MonitoringService {
  // 采集监控指标
  async collectMetrics(): Promise<MonitoringMetric[]> {
    const metrics: MonitoringMetric[] = [];
    const now = new Date();

    try {
      // 1. API响应时间监控（模拟）
      const apiResponseTime = Math.random() * 1000; // 0-1000ms
      metrics.push({
        type: 'api_response_time',
        value: apiResponseTime,
        timestamp: now
      });

      // 2. API错误率监控（模拟）
      const apiErrorRate = Math.random() * 10; // 0-10%
      metrics.push({
        type: 'api_error_rate',
        value: apiErrorRate,
        timestamp: now
      });

      // 3. 数据库连接监控
      try {
        await db.execute('SELECT 1');
        metrics.push({
          type: 'database_connection',
          value: 1, // 1表示正常
          timestamp: now
        });
      } catch (error) {
        metrics.push({
          type: 'database_connection',
          value: 0, // 0表示异常
          timestamp: now
        });
      }

      // 4. Redis健康状态监控
      try {
        await redisClient.ping();
        metrics.push({
          type: 'redis_health',
          value: 1, // 1表示正常
          timestamp: now
        });
      } catch (error) {
        metrics.push({
          type: 'redis_health',
          value: 0, // 0表示异常
          timestamp: now
        });
      }

      // 5. 磁盘使用率监控（模拟）
      const diskUsage = Math.random() * 100; // 0-100%
      metrics.push({
        type: 'disk_usage',
        value: diskUsage,
        timestamp: now
      });

      // 6. 内存使用率监控（模拟）
      const memoryUsage = Math.random() * 100; // 0-100%
      metrics.push({
        type: 'memory_usage',
        value: memoryUsage,
        timestamp: now
      });

    } catch (error) {
      logger.error('采集监控指标失败:', error);
    }

    return metrics;
  }

  // 检查告警规则
  async checkAlerts(metrics: MonitoringMetric[]): Promise<AlertEvent[]> {
    const alerts: AlertEvent[] = [];
    const rules = await this.getAlertRules();

    for (const metric of metrics) {
      const rule = rules.find(r => r.type === metric.type);
      if (!rule || !rule.enabled) continue;

      // 检查阈值
      if (this.shouldTriggerAlert(metric, rule)) {
        const alert = await this.createAlert(metric, rule);
        if (alert) alerts.push(alert);
      }
    }

    return alerts;
  }

  // 获取告警规则
  async getAlertRules(): Promise<AlertRule[]> {
    try {
      const rules = await db.select().from(monitoringRules);
      return rules.map(rule => ({
        id: rule.id,
        type: rule.type,
        threshold: rule.threshold,
        severity: rule.severity as 'critical' | 'warning' | 'info',
        enabled: rule.enabled
      }));
    } catch (error) {
      logger.error('获取告警规则失败:', error);
      return [];
    }
  }

  // 更新告警规则
  async updateAlertRule(ruleId: string, updates: Partial<AlertRule>) {
    try {
      await db.update(monitoringRules)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(monitoringRules.id, ruleId));
    } catch (error) {
      logger.error('更新告警规则失败:', error);
      throw error;
    }
  }

  // 创建告警规则
  async createAlertRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const [newRule] = await db.insert(monitoringRules)
        .values({
          type: rule.type,
          threshold: rule.threshold,
          severity: rule.severity,
          enabled: rule.enabled
        })
        .returning();

      return newRule;
    } catch (error) {
      logger.error('创建告警规则失败:', error);
      throw error;
    }
  }

  // 判断是否需要触发告警
  private shouldTriggerAlert(metric: MonitoringMetric, rule: AlertRule): boolean {
    // 对于数据库连接和Redis健康，value为0表示异常
    if (metric.type === 'database_connection' || metric.type === 'redis_health') {
      return metric.value === 0;
    }
    
    // 对于其他指标，超过阈值触发
    return metric.value > rule.threshold;
  }

  // 创建告警记录
  private async createAlert(metric: MonitoringMetric, rule: AlertRule): Promise<AlertEvent | null> {
    try {
      // 检查最近是否已有相同告警（告警去重）
      const recentAlerts = await db.select()
        .from(monitoringAlerts)
        .where(and(
          eq(monitoringAlerts.type, metric.type),
          eq(monitoringAlerts.acknowledged, false),
          gte(monitoringAlerts.createdAt, new Date(Date.now() - 5 * 60 * 1000)) // 5分钟内
        ));

      if (recentAlerts.length > 0) {
        logger.debug(`相同类型告警已在过去5分钟内存在，跳过创建: ${metric.type}`);
        return null;
      }

      const message = this.generateAlertMessage(metric, rule);
      const [alert] = await db.insert(monitoringAlerts)
        .values({
          type: metric.type,
          severity: rule.severity,
          message,
          value: metric.value,
          threshold: rule.threshold,
          timestamp: metric.timestamp
        })
        .returning();

      // 触发告警通知
      await this.triggerAlertNotification(alert);

      return {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        value: alert.value,
        threshold: alert.threshold,
        timestamp: alert.timestamp,
        acknowledged: alert.acknowledged,
        acknowledgedAt: alert.acknowledgedAt || undefined,
        createdAt: alert.createdAt
      };
    } catch (error) {
      logger.error('创建告警记录失败:', error);
      return null;
    }
  }

  // 生成告警消息
  private generateAlertMessage(metric: MonitoringMetric, rule: AlertRule): string {
    const typeMap: Record<string, string> = {
      'api_response_time': 'API响应时间',
      'api_error_rate': 'API错误率',
      'database_connection': '数据库连接',
      'redis_health': 'Redis健康状态',
      'disk_usage': '磁盘使用率',
      'memory_usage': '内存使用率'
    };

    const typeName = typeMap[metric.type] || metric.type;
    
    if (metric.type === 'database_connection' || metric.type === 'redis_health') {
      return `${typeName}异常，请立即检查`;
    }

    return `${typeName}超过阈值：当前 ${metric.value.toFixed(2)}，阈值 ${rule.threshold}`;
  }

  // 触发告警通知
  private async triggerAlertNotification(alert: any) {
    // 这里可以集成邮件、Webhook、短信等通知渠道
    logger.warn(`告警触发: ${alert.message}`);
    
    // TODO: 实现具体的通知逻辑
    // 1. 邮件通知
    // 2. Webhook通知
    // 3. 短信通知
    // 4. 移动端推送
  }

  // 获取告警列表
  async getAlerts(filters?: {
    type?: string;
    severity?: string;
    acknowledged?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    try {
      const conditions = [];
      
      if (filters?.type) {
        conditions.push(eq(monitoringAlerts.type, filters.type));
      }
      
      if (filters?.severity) {
        conditions.push(eq(monitoringAlerts.severity, filters.severity));
      }
      
      if (filters?.acknowledged !== undefined) {
        conditions.push(eq(monitoringAlerts.acknowledged, filters.acknowledged));
      }
      
      if (filters?.startDate) {
        conditions.push(gte(monitoringAlerts.createdAt, filters.startDate));
      }
      
      if (filters?.endDate) {
        conditions.push(lte(monitoringAlerts.createdAt, filters.endDate));
      }

      const query = db.select()
        .from(monitoringAlerts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(monitoringAlerts.createdAt, 'desc');

      if (filters?.limit) {
        query.limit(filters.limit);
      }
      
      if (filters?.offset) {
        query.offset(filters.offset);
      }

      const alerts = await query;
      const total = await db.$count(monitoringAlerts, 
        conditions.length > 0 ? and(...conditions) : undefined
      );

      return { alerts, total };
    } catch (error) {
      logger.error('获取告警列表失败:', error);
      throw error;
    }
  }

  // 确认告警
  async acknowledgeAlert(alertId: string) {
    try {
      await db.update(monitoringAlerts)
        .set({
          acknowledged: true,
          acknowledgedAt: new Date()
        })
        .where(eq(monitoringAlerts.id, alertId));
    } catch (error) {
      logger.error('确认告警失败:', error);
      throw error;
    }
  }

  // 获取监控统计
  async getMonitoringStats() {
    try {
      const totalAlerts = await db.$count(monitoringAlerts);
      const unacknowledgedAlerts = await db.$count(monitoringAlerts, 
        eq(monitoringAlerts.acknowledged, false)
      );
      const criticalAlerts = await db.$count(monitoringAlerts, 
        eq(monitoringAlerts.severity, 'critical')
      );
      const warningAlerts = await db.$count(monitoringAlerts, 
        eq(monitoringAlerts.severity, 'warning')
      );

      // 按类型统计
      const alertsByType = await db.select({
        type: monitoringAlerts.type,
        count: db.$count(monitoringAlerts.id)
      })
      .from(monitoringAlerts)
      .groupBy(monitoringAlerts.type);

      // 最近24小时告警趋势
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentAlerts = await db.select()
        .from(monitoringAlerts)
        .where(gte(monitoringAlerts.createdAt, last24Hours))
        .orderBy(monitoringAlerts.createdAt, 'asc');

      return {
        totalAlerts,
        unacknowledgedAlerts,
        criticalAlerts,
        warningAlerts,
        alertsByType,
        recentAlertsTrend: this.calculateHourlyTrend(recentAlerts)
      };
    } catch (error) {
      logger.error('获取监控统计失败:', error);
      throw error;
    }
  }

  // 计算小时趋势
  private calculateHourlyTrend(alerts: any[]) {
    const hourlyMap: Record<string, number> = {};
    
    alerts.forEach(alert => {
      const hour = alert.createdAt.toISOString().substring(0, 13) + ':00';
      hourlyMap[hour] = (hourlyMap[hour] || 0) + 1;
    });

    return Object.entries(hourlyMap)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  }
}

export const monitoringService = new MonitoringService();
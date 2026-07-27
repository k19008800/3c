// ============================================================
//  3cloud (3C) — 告警通知服务
//  支持多种告警通知渠道：邮件、Webhook、短信、移动端推送
// ============================================================

import { logger } from "../../logger.js";
import { monitoringAlerts } from "../../db/schema/monitoring.js";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";

export interface AlertNotificationConfig {
  emailEnabled: boolean;
  emailRecipients: string[];
  webhookEnabled: boolean;
  webhookUrl: string;
  smsEnabled: boolean;
  smsPhoneNumbers: string[];
  pushEnabled: boolean;
  pushTokens: string[];
}

export interface AlertMessage {
  id: string;
  type: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  createdAt: Date;
}

export class AlertService {
  private notificationConfig: AlertNotificationConfig = {
    emailEnabled: true,
    emailRecipients: ['admin@3cloud.com'],
    webhookEnabled: false,
    webhookUrl: '',
    smsEnabled: false,
    smsPhoneNumbers: [],
    pushEnabled: false,
    pushTokens: []
  };

  // 发送告警通知
  async sendAlert(alert: AlertMessage): Promise<void> {
    try {
      const notifications = [];

      // 邮件通知
      if (this.notificationConfig.emailEnabled && this.notificationConfig.emailRecipients.length > 0) {
        notifications.push(this.sendEmailAlert(alert));
      }

      // Webhook通知
      if (this.notificationConfig.webhookEnabled && this.notificationConfig.webhookUrl) {
        notifications.push(this.sendWebhookAlert(alert));
      }

      // 短信通知（仅紧急告警）
      if (this.notificationConfig.smsEnabled && alert.severity === 'critical') {
        notifications.push(this.sendSmsAlert(alert));
      }

      // 移动端推送
      if (this.notificationConfig.pushEnabled) {
        notifications.push(this.sendPushAlert(alert));
      }

      // 并行发送所有通知
      await Promise.allSettled(notifications);

      logger.info(`告警通知发送完成: ${alert.id}`);
    } catch (error) {
      logger.error('发送告警通知失败:', error);
    }
  }

  // 发送邮件告警
  private async sendEmailAlert(alert: AlertMessage): Promise<void> {
    try {
      const subject = `[${alert.severity.toUpperCase()}] ${this.getAlertTitle(alert)}`;
      const body = this.formatEmailContent(alert);

      // TODO: 集成邮件发送服务
      // 这里可以使用 nodemailer、sendgrid、ses 等
      logger.debug(`邮件告警准备发送: ${subject}`);
      
      // 模拟邮件发送
      for (const recipient of this.notificationConfig.emailRecipients) {
        logger.info(`发送邮件告警到 ${recipient}: ${subject}`);
      }
    } catch (error) {
      logger.error('发送邮件告警失败:', error);
      throw error;
    }
  }

  // 发送Webhook告警
  private async sendWebhookAlert(alert: AlertMessage): Promise<void> {
    try {
      const webhookData = {
        event: 'monitoring_alert',
        alert_id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        value: alert.value,
        threshold: alert.threshold,
        timestamp: alert.timestamp.toISOString(),
        source: '3cloud-monitoring'
      };

      // TODO: 实现实际的Webhook调用
      logger.debug(`Webhook告警准备发送: ${JSON.stringify(webhookData)}`);
      
      // 模拟Webhook调用
      logger.info(`发送Webhook告警到 ${this.notificationConfig.webhookUrl}`);
    } catch (error) {
      logger.error('发送Webhook告警失败:', error);
      throw error;
    }
  }

  // 发送短信告警
  private async sendSmsAlert(alert: AlertMessage): Promise<void> {
    try {
      const smsContent = `[3Cloud告警] ${alert.severity}: ${alert.message.substring(0, 50)}...`;

      // TODO: 集成短信服务
      // 这里可以使用 Twilio、阿里云短信、腾讯云短信等
      logger.debug(`短信告警准备发送: ${smsContent}`);
      
      // 模拟短信发送
      for (const phone of this.notificationConfig.smsPhoneNumbers) {
        logger.info(`发送短信告警到 ${phone}: ${smsContent}`);
      }
    } catch (error) {
      logger.error('发送短信告警失败:', error);
      throw error;
    }
  }

  // 发送移动端推送告警
  private async sendPushAlert(alert: AlertMessage): Promise<void> {
    try {
      const pushData = {
        title: `3Cloud告警: ${alert.severity}`,
        body: alert.message,
        data: {
          alertId: alert.id,
          type: alert.type,
          severity: alert.severity,
          timestamp: alert.timestamp.getTime()
        }
      };

      // TODO: 集成推送服务
      // 这里可以使用 Firebase Cloud Messaging、OneSignal、APNs等
      logger.debug(`移动端推送告警准备发送: ${JSON.stringify(pushData)}`);
      
      // 模拟推送发送
      for (const token of this.notificationConfig.pushTokens) {
        logger.info(`发送推送告警到设备 ${token.substring(0, causal8)}`);
      }
    } catch (error) {
      logger.error('发送移动端推送告警失败:', error);
      throw error;
    }
  }

  // 获取告警标题
  private getAlertTitle(alert: AlertMessage): string {
    const typeMap: Record<string, string> = {
      'api_response_time': 'API响应时间告警',
      'api_error_rate': 'API错误率告警',
      'database_connection': '数据库连接告警',
      'redis_health': 'Redis健康状态告警',
      'disk_usage': '磁盘使用率告警',
      'memory_usage': '内存使用率告警'
    };

    return typeMap[alert.type] || '系统监控告警';
  }

  // 格式化邮件内容
  private formatEmailContent(alert: AlertMessage): string {
    const severityColor = {
      critical: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8'
    }[alert.severity];

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .alert-box { 
            border-left: 4px solid ${severityColor};
            padding: ppx; 
            margin: 20px 0;
            background: #f8f9fa;
          }
          .severity { 
            color: ${severityColor}; 
            font-weight: bold; 
          }
          .details { margin-top: 10px; }
          .timestamp { color: #6c757d; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <h2>${this.getAlertTitle(alert)}</h2>
        <div class="alert-box">
          <p><strong>严重程度:</strong> <span class="severity">${alert.severity.toUpperCase()}</span></p>
          <p><strong>告警信息:</strong> ${alert.message}</p>
          <div class="details">
            <p><strong>当前值:</strong> ${alert.value.toFixed(2)}</p>
            <p><strong>阈值:</strong> ${alert.threshold}</p>
            <p><strong>监控类型:</strong> ${alert.type}</p>
          </div>
          <p class="timestamp">告警时间: ${alert.timestamp.toLocaleString()}</p>
        </div>
        <p>请及时登录 <a href="https://admin.3cloud.com/monitoring">3Cloud管理后台</a> 查看和处理。</p>
        <hr>
        <p style="color: #6c757d; font-size: 0.8em;">
          此邮件由3Cloud监控系统自动发送，请勿回复。
        </p>
      </body>
      </html>
    `.trim();
  }

  // 更新通知配置
  async updateNotificationConfig(config: Partial<AlertNotificationConfig>): Promise<void> {
    this.notificationConfig = {
      ...this.notificationConfig,
      ...config
    };

    // TODO: 将配置保存到数据库或配置文件
    logger.info('告警通知配置已更新');
  }

  // 获取通知配置
  getNotificationConfig(): AlertNotificationConfig {
    return { ...this.notificationConfig };
  }

  // 批量发送告警通知
  async sendBulkAlerts(alerts: AlertMessage[]): Promise<void> {
    if (alerts.length === 0) return;

    // 按严重程度排序，先发送紧急告警
    const sortedAlerts = alerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity as keyof typeof severityOrder] - 
             severityOrder[b.severity as keyof typeof severityOrder];
    });

    // 限制并发数量
    const batchSize = 5;
    for (let i = 0; i < sortedAlerts.length; i += batchSize) {
      const batch = sortedAlerts.slice(i, i + batchSize);
      const promises = batch.map(alert => this.sendAlert(alert));
      await Promise.allSettled(promises);
      
      // 批次间延迟
      if (i + batchSize < sortedAlerts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // 测试通知渠道
  async testNotificationChannel(channel: 'email' | 'webhook' | 'sms' | 'push'): Promise<boolean> {
    try {
      const testAlert: AlertMessage = {
        id: 'test-' + Date.now(),
        type: 'test',
        severity: 'info',
        message: '测试告警通知',
        value: 0,
        threshold: 0,
        timestamp: new Date(),
        createdAt: new Date()
      };

      switch (channel) {
        case 'email':
          await this.sendEmailAlert(testAlert);
          break;
        case 'webhook':
          await this.sendWebhookAlert(testAlert);
          break;
        case 'sms':
          await this.sendSmsAlert(testAlert);
          break;
        case 'push':
          await this.sendPushAlert(testAlert);
          break;
      }

      logger.info(`${channel}通知渠道测试成功`);
      return true;
    } catch (error) {
      logger.error(`${channel}通知渠道测试失败:`, error);
      return false;
    }
  }

  // 获取告警通知历史
  async getNotificationHistory(filters?: {
    startDate?: Date;
    endDate?: Date;
    channel?: string;
    limit?: number;
    offset?: number;
  }) {
    // TODO: 实现通知历史记录查询
    // 需要创建 notification_history 表来记录发送历史
    logger.debug('获取告警通知历史', filters);
    return { history: [], total: 0 };
  }

  // 告警升级策略
  async escalateAlert(alertId: string): Promise<void> {
    try {
      // 获取告警详情
      const [alert] = await db.select()
        .from(monitoringAlerts)
        .where(eq(monitoringAlerts.id, alertId));

      if (!alert) {
        throw new Error('告警不存在');
      }

      // 如果告警未确认且超过一定时间，进行升级
      if (!alert.acknowledged) {
        const hoursSinceCreation = (Date.now() - alert.createdAt.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceCreation > 4 && alert.severity === 'warning') {
          // 升级为紧急告警
          logger.warn(`告警升级: ${alertId} 从 warning 升级为 critical`);
          
          // TODO: 发送升级通知给更高级别的人员
          // TODO: 可能还需要发送短信或电话通知
        }
      }
    } catch (error) {
      logger.error('告警升级失败:', error);
    }
  }
}

export const alertService = new AlertService();
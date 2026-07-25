// ============================================================
//  3cloud (3C) — 监控检查定时任务
//  每5分钟运行一次，检查系统指标并触发告警
// ============================================================

import { monitoringService } from "../services/monitoring-service/index.js";
import { alertService } from "../services/alert-service/index.js";
import { logger } from "../logger.js";

export async function runMonitoringCheck() {
  try {
    logger.info('开始执行监控检查...');

    // 1. 采集监控指标
    const metrics = await monitoringService.collectMetrics();
    logger.debug(`采集到 ${metrics.length} 个监控指标`);

    // 2. 检查告警规则
    const alerts = await monitoringService.checkAlerts(metrics);
    
    if (alerts.length > 0) {
      logger.warn(`检测到 ${alerts.length} 个告警事件`);
      
      // 3. 发送告警通知
      await alertService.sendBulkAlerts(alerts);
      
      // 记录到日志
      alerts.forEach(alert => {
        logger.warn(`告警: ${alert.type} - ${alert.message} (严重程度: ${alert.severity})`);
      });
    } else {
      logger.info('未检测到告警事件');
    }

    // 4. 记录本次检查结果（可选，用于统计）
    logger.info('监控检查完成');
    
    return {
      success: true,
      metricsCollected: metrics.length,
      alertsTriggered: alerts.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('监控检查失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

// 定时任务配置
export const monitoringCheckJob = {
  name: 'monitoring-check',
  schedule: '*/5 * * * *', // 每5分钟运行一次
  handler: runMonitoringCheck,
  description: '监控系统指标检查，触发告警通知'
};

// 测试函数
export async function testMonitoringCheck() {
  logger.info('测试监控检查功能...');
  
  const result = await runMonitoringCheck();
  
  if (result.success) {
    logger.info(`监控检查测试成功: ${result.metricsCollected} 个指标, ${result.alertsTriggered} 个告警`);
  } else {
    logger.error(`监控检查测试失败: ${result.error}`);
  }
  
  return result;
}
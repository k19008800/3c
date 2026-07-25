// ============================================================
//  3cloud (3C) — 异常操作告警定时任务
//  每 5 分钟扫描操作日志，检测异常模式
// ============================================================

import { FastifyInstance } from "fastify";
import { detectOperationAnomalies } from "../services/operation-alert.js";

// 垫片：operation-alert.ts 还未完成 scanOperationAlerts 导出，
// 这里用 detectOperationAnomalies 临时包装
async function scanOperationAlerts(): Promise<{ alertsCreated: number; errors: string[] }> {
  try {
    const alerts = await detectOperationAnomalies();
    return { alertsCreated: alerts.length, errors: [] };
  } catch (err) {
    return { alertsCreated: 0, errors: [String(err)] };
  }
}

let schedulerInterval: NodeJS.Timeout | null = null;
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

// ── 启动定时扫描 ──

export async function startOperationAlertScheduler(
  app: FastifyInstance
): Promise<void> {
  // 避免重复启动
  if (schedulerInterval) {
    app.log.warn("[operation-alert-scheduler] Scheduler already running");
    return;
  }
  
  // 启动定时任务
  schedulerInterval = setInterval(async () => {
    try {
      app.log.debug("[operation-alert-scheduler] Starting scan...");
      const result = await scanOperationAlerts();
      
      if (result.alertsCreated > 0) {
        app.log.info(
          `[operation-alert-scheduler] Scan complete: ${result.alertsCreated} alerts created`
        );
      }
      
      if (result.errors.length > 0) {
        app.log.warn(
          `[operation-alert-scheduler] Scan errors: ${result.errors.join(", ")}`
        );
      }
    } catch (err) {
      app.log.error("[operation-alert-scheduler] Scan failed:", err);
    }
  }, SCAN_INTERVAL_MS);
  
  app.log.info(
    `[operation-alert-scheduler] Started (interval: ${SCAN_INTERVAL_MS / 1000}s)`
  );
  
  // 启动后立即执行一次扫描
  setTimeout(async () => {
    try {
      app.log.info("[operation-alert-scheduler] Initial scan...");
      const result = await scanOperationAlerts();
      app.log.info(
        `[operation-alert-scheduler] Initial scan complete: ${result.alertsCreated} alerts created`
      );
    } catch (err) {
      app.log.error("[operation-alert-scheduler] Initial scan failed:", err);
    }
  }, 5000); // 延迟 5 秒，等待服务完全启动
}

// ── 停止定时扫描 ──

export function stopOperationAlertScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[operation-alert-scheduler] Stopped");
  }
}

// ── 手动触发扫描（用于管理接口） ──

export async function manualScan(): Promise<{
  success: boolean;
  alertsCreated: number;
  errors: string[];
}> {
  try {
    const result = await scanOperationAlerts();
    return {
      success: true,
      alertsCreated: result.alertsCreated,
      errors: result.errors,
    };
  } catch (err) {
    return {
      success: false,
      alertsCreated: 0,
      errors: [String(err)],
    };
  }
}

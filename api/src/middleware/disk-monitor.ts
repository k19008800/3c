// ============================================================
//  磁盘空间监控中间件
//  定期检查 uploads 目录磁盘空间，不足时告警
// ============================================================

import { statfs } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const UPLOAD_DIR = join(import.meta.dirname, "../../public/uploads/site");
const MIN_FREE_MB = 500; // 最小剩余空间 500MB
const ALERT_INTERVAL_MS = 60 * 60 * 1000; // 每小时检查一次

let lastAlertTime = 0;
let lastCheckTime = 0;
let lastFreeMB = 0;

export async function checkDiskSpace(): Promise<{ freeMB: number; ok: boolean }> {
  if (!existsSync(UPLOAD_DIR)) {
    return { freeMB: 0, ok: false };
  }

  try {
    const stats = await statfs(UPLOAD_DIR);
    const freeMB = (stats.bavail * stats.bsize) / (1024 * 1024);
    lastFreeMB = freeMB;
    lastCheckTime = Date.now();
    return { freeMB, ok: freeMB >= MIN_FREE_MB };
  } catch (err) {
    console.error("[DiskMonitor] 检查失败:", err);
    return { freeMB: 0, ok: false };
  }
}

export async function diskMonitorMiddleware() {
  const now = Date.now();

  // 避免频繁检查
  if (now - lastCheckTime < 60 * 1000) {
    return;
  }

  const { freeMB, ok } = await checkDiskSpace();

  if (!ok && now - lastAlertTime >= ALERT_INTERVAL_MS) {
    lastAlertTime = now;
    console.error(`[DiskMonitor] ⚠️ 磁盘空间不足: 剩余 ${freeMB.toFixed(1)}MB (最小 ${MIN_FREE_MB}MB)`);

    // TODO: 发送告警通知（邮件/钉钉/企微等）
    // 示例: await sendAlert({ type: "disk_space", message: `磁盘空间不足: ${freeMB.toFixed(1)}MB` });
  }
}

// 定时检查（每小时）
setInterval(async () => {
  await diskMonitorMiddleware();
}, ALERT_INTERVAL_MS);

// 启动时检查一次
diskMonitorMiddleware();

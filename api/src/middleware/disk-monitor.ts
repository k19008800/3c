// ============================================================
//  磁盘空间监控中间件
//  定期检查 uploads 目录磁盘空间，不足时告警
//  支持多渠道推送（钉钉/企微/邮件）
// ============================================================

import { statfs } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pushSystemAlert } from "../services/alert-channel-service.js";

const UPLOAD_DIR = join(import.meta.dirname, "../public/uploads/site");
const MIN_FREE_MB = 500;  // 最小剩余空间 500MB
const CRITICAL_FREE_MB = 200; // 严重不足阈值
const ALERT_INTERVAL_MS = 60 * 60 * 1000; // 告警间隔 1 小时
const CHECK_INTERVAL_MS = 60 * 1000; // 检查间隔 1 分钟
const ALERT_INTERVAL_FAST_MS = 30 * 60 * 1000; // 严重告警间隔 30 分钟

let lastAlertTime = 0;
let lastAlertLevel: "ok" | "warning" | "critical" = "ok";
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
  const alertLevel: "warning" | "critical" = freeMB < CRITICAL_FREE_MB ? "critical" : "warning";

  // 严重告警：更短的间隔
  const interval = alertLevel === "critical" ? ALERT_INTERVAL_FAST_MS : ALERT_INTERVAL_MS;

  if (!ok) {
    if (alertLevel as string !== (lastAlertLevel as string)) {
      // 级别变化：立即发送
      await sendAlert(alertLevel, freeMB);
      lastAlertTime = now;
      lastAlertLevel = alertLevel;
    } else if (now - lastAlertTime >= interval) {
      await sendAlert(alertLevel, freeMB);
      lastAlertTime = now;
    }
  } else {
    lastAlertLevel = "ok";
  }
}

async function sendAlert(level: "warning" | "critical", freeMB: number) {
  const gb = (freeMB / 1024).toFixed(2);
  const title = level === "critical"
    ? "🔴 磁盘空间严重不足"
    : "🟡 磁盘空间不足";

  const message = [
    `**服务器**: 本地 (Windows 10)`,
    `**目录**: ${UPLOAD_DIR}`,
    `**剩余空间**: ${freeMB.toFixed(1)} MB (${gb} GB)`,
    `**阈值**: 小于 ${level === "critical" ? CRITICAL_FREE_MB + "MB" : MIN_FREE_MB + "MB"}`,
    level === "critical"
      ? "**建议**: 立即清理 uploads 目录或扩展磁盘"
      : "**建议**: 关注磁盘使用情况，及时清理旧文件",
  ].join("\n");

  await pushSystemAlert(title, message, level === "critical" ? "critical" : "warning");
}

// 恢复状态：重启后允许立即告警
let started = false;

// 定时检查
setInterval(async () => {
  await diskMonitorMiddleware();
}, CHECK_INTERVAL_MS);

// 启动时检查（延迟 10 秒，等服务就绪）
setTimeout(async () => {
  await diskMonitorMiddleware();
  started = true;
}, 10_000);

export function isDiskMonitorStarted(): boolean {
  return started;
}

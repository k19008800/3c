// ============================================================
//  孤儿上传文件清理（Cron 任务）
//  清理 uploads 目录中未被引用且超过指定天数的文件
// ============================================================

import { getDb } from "../db/index.js";
import { systemConfigs } from "../db/schema.js";
import { like } from "drizzle-orm";
import { readdirSync, statSync, unlinkSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const UPLOAD_DIR = join(import.meta.dirname, "../../public/uploads/site");

export interface CleanResult {
  count: number;
  size: number;
  errors: string[];
}

export async function cleanOrphanUploads(options: { days?: number } = {}): Promise<CleanResult> {
  const days = options.days ?? 7;
  const result: CleanResult = { count: 0, size: 0, errors: [] };

  if (!existsSync(UPLOAD_DIR)) {
    return result;
  }

  // 1. 获取数据库中引用的所有文件
  const db = getDb();

  const configs = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(like(systemConfigs.key, "site_%"));

  const referencedFiles = new Set<string>();
  for (const cfg of configs) {
    if (cfg.value && cfg.value.startsWith("/uploads/site/")) {
      const filename = basename(cfg.value);
      referencedFiles.add(filename);
    }
  }

  // 2. 扫描上传目录
  const files = readdirSync(UPLOAD_DIR);
  const now = Date.now();
  const cutoffMs = days * 24 * 60 * 60 * 1000;

  for (const file of files) {
    // 跳过隐藏文件
    if (file.startsWith(".")) continue;

    const filePath = join(UPLOAD_DIR, file);
    const stats = statSync(filePath);

    // 跳过目录
    if (stats.isDirectory()) continue;

    // 检查是否被引用
    if (referencedFiles.has(file)) continue;

    // 检查文件年龄
    const ageMs = now - stats.mtimeMs;
    if (ageMs < cutoffMs) continue;

    // 删除文件
    try {
      unlinkSync(filePath);
      result.count++;
      result.size += stats.size;
    } catch (err) {
      result.errors.push(`${file}: ${err}`);
    }
  }

  return result;
}

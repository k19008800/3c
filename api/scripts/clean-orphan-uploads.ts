#!/usr/bin/env tsx
// ============================================================
//  清理 uploads 目录中的孤儿文件
//  孤儿文件：存在于 uploads/ 但未被 system_configs 引用的文件
//  用法: tsx scripts/clean-orphan-uploads.ts [--dry-run] [--days 7]
// ============================================================

import { getDb, createDb } from "../src/db/index.js";
import { systemConfigs } from "../src/db/schema.js";
import { like } from "drizzle-orm";
import { readdirSync, statSync, unlinkSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const UPLOAD_DIR = join(import.meta.dirname, "../public/uploads/site");
const DRY_RUN = process.argv.includes("--dry-run");
const DAYS_ARG = process.argv.find((arg) => arg.startsWith("--days"));
const DAYS = DAYS_ARG ? parseInt(DAYS_ARG.split("=")[1] || DAYS_ARG.split(" ")[1] || "7", 10) : 7;

async function main() {
  console.log("=== 清理孤儿上传文件 ===");
  console.log(`模式: ${DRY_RUN ? "预览（不删除）" : "实际删除"}`);
  console.log(`最小天数: ${DAYS} 天`);
  console.log(`上传目录: ${UPLOAD_DIR}`);
  console.log("");

  if (!existsSync(UPLOAD_DIR)) {
    console.log("上传目录不存在，退出");
    process.exit(0);
  }

  // 1. 获取数据库中引用的所有文件
  await createDb();
  const db = getDb();

  const configs = await db
    .select({ key: systemConfigs.key, value: systemConfigs.value })
    .from(systemConfigs)
    .where(like(systemConfigs.key, "site_%"));

  const referencedFiles = new Set<string>();
  for (const cfg of configs) {
    if (cfg.value && cfg.value.startsWith("/uploads/site/")) {
      const filename = basename(cfg.value);
      referencedFiles.add(filename);
    }
  }

  console.log(`数据库引用文件数: ${referencedFiles.size}`);
  console.log("引用文件列表:", Array.from(referencedFiles).join(", ") || "(无)");
  console.log("");

  // 2. 扫描上传目录
  const files = readdirSync(UPLOAD_DIR);
  const now = Date.now();
  const cutoffMs = DAYS * 24 * 60 * 60 * 1000;

  const orphanFiles: Array<{ name: string; size: number; age: number; mtime: Date }> = [];

  for (const file of files) {
    // 跳过 .gitkeep 等隐藏文件
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

    orphanFiles.push({
      name: file,
      size: stats.size,
      age: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
      mtime: stats.mtime,
    });
  }

  if (orphanFiles.length === 0) {
    console.log("没有孤儿文件需要清理");
    process.exit(0);
  }

  console.log(`孤儿文件数: ${orphanFiles.length}`);
  console.log("");

  // 3. 显示孤儿文件列表
  let totalSize = 0;
  for (const file of orphanFiles) {
    const sizeKB = (file.size / 1024).toFixed(1);
    console.log(`  ${file.name} - ${sizeKB} KB - ${file.age} 天前 - ${file.mtime.toISOString()}`);
    totalSize += file.size;
  }

  console.log("");
  console.log(`总计: ${orphanFiles.length} 个文件，${(totalSize / 1024 / 1024).toFixed(2)} MB`);

  // 4. 删除（非 dry-run 模式）
  if (!DRY_RUN) {
    console.log("");
    console.log("开始删除...");

    for (const file of orphanFiles) {
      const filePath = join(UPLOAD_DIR, file.name);
      try {
        unlinkSync(filePath);
        console.log(`  ✓ ${file.name}`);
      } catch (err) {
        console.error(`  ✗ ${file.name}: ${err}`);
      }
    }

    console.log("清理完成");
  } else {
    console.log("");
    console.log("预览模式，未删除文件。移除 --dry-run 参数以实际删除。");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("清理失败:", err);
  process.exit(1);
});

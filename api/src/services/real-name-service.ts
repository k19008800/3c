// ============================================================
//  3cloud (3C) — 实名认证服务层
//  文件管理 + 身份证校验 + 自动核验编排
// ============================================================

import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { systemConfigs } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { AppError } from "./auth-service.js";
import { VerifyProviderFactory } from "./real-name-verify/provider.js";

// ──────────────────────────────────────────────
//  常量
// ──────────────────────────────────────────────

const REAL_NAME_DIR = "real-name";

const FILE_TYPE_MAP: Record<string, { field: string; label: string }> = {
  id_front: { field: "idFrontImage", label: "身份证正面" },
  id_back: { field: "idBackImage", label: "身份证反面" },
  business_license: { field: "businessLicense", label: "营业执照" },
};

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

// ──────────────────────────────────────────────
//  身份证校验
// ──────────────────────────────────────────────

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CODES = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

/**
 * 18 位身份证最后一位校验码验证
 */
export function validateIdNumber(id: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(id[i], 10) * WEIGHTS[i];
  }
  return id[17].toUpperCase() === CHECK_CODES[sum % 11];
}

// ──────────────────────────────────────────────
//  文件路径工具
// ──────────────────────────────────────────────

function getBaseUploadDir(): string {
  const uploadDir = config.upload.dir || "./uploads";
  // 确保目录存在
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

function getUserDir(userId: number): string {
  return path.join(getBaseUploadDir(), REAL_NAME_DIR, String(userId));
}

function getFilePath(userId: number, version: number, fileType: string, ext: string): string {
  return path.join(getUserDir(userId), `${version}_${fileType}${ext}`);
}

/**
 * 获取文件在磁盘上的完整路径
 */
export function getFileAbsolutePath(relativePath: string): string {
  // 防止路径穿越
  const normalized = path.normalize(relativePath).replace(/^[/\\]/, "");
  if (normalized.includes("..")) {
    throw new AppError("INVALID_PATH", "非法文件路径", 400);
  }
  return path.join(getBaseUploadDir(), normalized);
}

/**
 * 从绝对路径提取相对路径（用于存储）
 */
export function toRelativePath(absolutePath: string): string {
  const baseDir = path.resolve(getBaseUploadDir());
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    throw new AppError("INVALID_PATH", "文件不在上传目录内", 400);
  }
  return "/" + path.relative(baseDir, resolved).replace(/\\/g, "/");
}

// ──────────────────────────────────────────────
//  系统配置加载（缓存到 Redis）
// ──────────────────────────────────────────────

let systemConfigCache: Record<string, string> | null = null;
let configLoadedAt = 0;
const CONFIG_CACHE_TTL = 30_000; // 30 秒

async function loadSystemConfigs(): Promise<Record<string, string>> {
  const now = Date.now();
  if (systemConfigCache && now - configLoadedAt < CONFIG_CACHE_TTL) {
    return systemConfigCache;
  }

  const db = getDb();
  const rows = await db.select().from(systemConfigs);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  systemConfigCache = map;
  configLoadedAt = now;
  return map;
}

export function invalidateConfigCache(): void {
  systemConfigCache = null;
}

// ──────────────────────────────────────────────
//  文件上传处理
// ──────────────────────────────────────────────

export interface FileUploadResult {
  filePath: string;     // 磁盘绝对路径
  relativePath: string; // 相对路径（存数据库用）
  ext: string;
}

/**
 * 保存上传的实名证件文件
 */
export async function saveUploadedFile(
  userId: number,
  version: number,
  fileType: string,       // id_front | id_back | business_license
  fileBuffer: Buffer,
  originalName: string,
): Promise<FileUploadResult> {
  // 1. 校验文件类型
  const typeInfo = FILE_TYPE_MAP[fileType];
  if (!typeInfo) {
    throw new AppError("INVALID_FILE_TYPE", `不支持的证件类型: ${fileType}`, 400);
  }

  const configs = await loadSystemConfigs();
  const allowedExts = (configs["real_name_allowed_exts"] || "jpg,jpeg,png").split(",").map((e) => e.trim().toLowerCase());
  const maxSize = parseInt(configs["real_name_upload_max_size"] || "5242880", 10);

  // 2. 校验扩展名
  const ext = path.extname(originalName).toLowerCase();
  if (!allowedExts.includes(ext.replace(".", ""))) {
    throw new AppError("FILE_TYPE_NOT_ALLOWED", `不支持的文件格式，允许: ${allowedExts.join(", ")}`, 400);
  }

  // 3. 校验文件大小
  if (fileBuffer.length > maxSize) {
    throw new AppError("FILE_TOO_LARGE", `文件大小不能超过 ${Math.round(maxSize / 1024 / 1024 * 100) / 100}MB`, 400);
  }

  // 4. 确保用户目录存在
  const userDir = getUserDir(userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // 5. 写入文件
  const absolutePath = getFilePath(userId, version, fileType, ext);
  fs.writeFileSync(absolutePath, fileBuffer);

  const relativePath = toRelativePath(absolutePath);

  return { filePath: absolutePath, relativePath, ext };
}

/**
 * 删除用户某个版本的旧文件
 */
export function removeUserVersionFiles(userId: number, version: number): void {
  const userDir = getUserDir(userId);
  if (!fs.existsSync(userDir)) return;

  const prefix = `${version}_`;
  const files = fs.readdirSync(userDir);
  for (const file of files) {
    if (file.startsWith(prefix)) {
      fs.unlinkSync(path.join(userDir, file));
    }
  }
}

/**
 * 获取文件的 MIME 类型
 */
export function getMimeType(ext: string): string {
  return MIME_MAP[ext] || "application/octet-stream";
}

// ──────────────────────────────────────────────
//  提交频率限制
// ──────────────────────────────────────────────

const SUBMIT_RATE_KEY = "realname:rate";
const SUBMIT_COOLDOWN = 300; // 5 分钟

export async function checkSubmitRateLimit(userId: number): Promise<void> {
  const redis = getRedis();
  const key = `${SUBMIT_RATE_KEY}:${userId}`;
  const ttl = await redis.ttl(key);
  if (ttl > 0) {
    throw new AppError("TOO_FREQUENT", `提交过于频繁，请 ${Math.ceil(ttl / 60)} 分钟后再试`, 429);
  }
}

export async function markSubmitRateLimit(userId: number): Promise<void> {
  const redis = getRedis();
  const key = `${SUBMIT_RATE_KEY}:${userId}`;
  await redis.setex(key, SUBMIT_COOLDOWN, "1");
}

// ──────────────────────────────────────────────
//  自动核验编排
// ──────────────────────────────────────────────

export interface AutoVerifyResult {
  autoVerified: boolean;
  passed: boolean;
  rawResult?: Record<string, any>;
}

/**
 * 用户提交实名信息后执行自动核验
 */
export async function autoVerifyRealName(userId: number, version: number): Promise<AutoVerifyResult> {
  const configs = await loadSystemConfigs();
  const enabled = configs["real_name_auto_verify"];

  if (enabled !== "true") {
    return { autoVerified: false, passed: false };
  }

  const providerName = configs["real_name_verify_provider"] || "aliyun";
  const appCode = configs["aliyun_id_verify_app_code"] || "";

  if (!appCode) {
    console.warn(`[RealName] 自动核验已启用但未配置 AppCode，跳过`);
    return { autoVerified: false, passed: false };
  }

  // 加载用户信息
  const db = getDb();
  const { users } = await import("../db/schema.js");
  const [user] = await db
    .select({
      realName: users.realName,
      idNumber: users.idNumber,
      companyName: users.companyName,
      companyRegNumber: users.companyRegNumber,
      userType: users.userType,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.realName || !user.idNumber) {
    return { autoVerified: false, passed: false };
  }

  const provider = VerifyProviderFactory.create(providerName, appCode);
  let result: { passed: boolean; rawResponse: Record<string, any> };

  try {
    if (user.userType === "enterprise" && user.companyName && user.companyRegNumber) {
      result = await provider.verifyEnterprise({
        realName: user.realName,
        idNumber: user.idNumber,
        companyName: user.companyName,
        companyRegNumber: user.companyRegNumber,
      });
    } else {
      result = await provider.verifyPersonal({ realName: user.realName, idNumber: user.idNumber });
    }
  } catch (err) {
    console.error(`[RealName] 自动核验失败 (userId=${userId}):`, err);
    // 核验异常不阻断流程，改为人工审核
    return { autoVerified: true, passed: false, rawResult: { error: String(err) } };
  }

  if (result.passed) {
    // 自动通过
    await autoApproveRealName(userId, version, result.rawResponse);
    return { autoVerified: true, passed: true, rawResult: result.rawResponse };
  }

  return { autoVerified: true, passed: false, rawResult: result.rawResponse };
}

/**
 * 自动通过实名认证
 */
export async function autoApproveRealName(
  userId: number,
  version: number,
  verifyResult: Record<string, any>,
): Promise<void> {
  const db = getDb();
  const { users, userRealNameReviews, auditLogs } = await import("../db/schema.js");

  const now = new Date();

  await db.transaction(async (tx) => {
    // 更新 users 表
    await tx
      .update(users)
      .set({ realNameStatus: "approved" })
      .where(eq(users.id, userId));

    // 更新审核记录
    await tx
      .update(userRealNameReviews)
      .set({
        status: "approved",
        reviewedAt: now,
        // 将核验结果存入 rejectReason 字段（临时方案，避免改表）
        // 实际可以通过在 user_real_name_reviews 表加 verify_result text 字段
        rejectReason: verifyResult
          ? `[auto_verify] ${JSON.stringify(verifyResult)}`
          : "[auto_verify] passed",
      })
      .where(
        and(
          eq(userRealNameReviews.userId, userId),
          eq(userRealNameReviews.version, version),
        )
      );

    // 审计日志
    await tx.insert(auditLogs).values({
      operatorId: 0,        // 系统自动操作
      action: "real_name_approve",
      targetType: "user",
      targetId: userId,
      before: { realNameStatus: "pending_review" },
      after: { realNameStatus: "approved" },
      ip: "system",
      description: `实名自动审核通过（第三方核验）`,
    });
  });

  // 发送通知（不阻塞事务）
  const { notifyRealNameReviewResult } = await import("./notification-service.js");
  const [userInfo] = await getDb()
    .select({
      email: users.email,
      nickname: users.nickname,
      realName: users.realName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userInfo) {
    notifyRealNameReviewResult({
      userId,
      email: userInfo.email,
      nickname: userInfo.nickname,
      realName: userInfo.realName || "用户",
      status: "approved",
    }).catch((err: any) => {
      console.error(`自动审核通知发送失败 (userId=${userId}):`, err);
    });
  }
}

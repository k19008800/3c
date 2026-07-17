// ============================================================
//  3cloud (3C) — 实名认证 文件管理
// ============================================================

import path from "node:path";
import fs from "node:fs";
import { config } from "../../config.js";
import { AppError } from "../auth-service/index.js";
import type { FileUploadResult } from "./types.js";
import { loadSystemConfigs } from "./system-config.js";

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
//  文件上传处理
// ──────────────────────────────────────────────

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

  // 3. 校验文件内容（magic bytes）
  const signatureCheck = (buffer: Buffer, signatures: number[][]): boolean => {
    return signatures.some((sig) => {
      if (sig.length > buffer.length) return false;
      return sig.every((byte, i) => buffer[i] === byte);
    });
  };

  const JPEG_SIGNATURES = [
    [0xFF, 0xD8, 0xFF],
  ];
  const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46];

  const signMap: Record<string, number[][]> = {
    jpg: JPEG_SIGNATURES,
    jpeg: JPEG_SIGNATURES,
    png: [PNG_SIGNATURE],
    pdf: [PDF_SIGNATURE],
  };

  const requiredExt = ext.replace(".", "");
  const expectedSigs = signMap[requiredExt];
  if (expectedSigs) {
    const validFile = signatureCheck(fileBuffer, expectedSigs);
    if (!validFile) {
      throw new AppError(
        "INVALID_FILE_CONTENT",
        `文件内容与扩展名不匹配（期望 ${requiredExt.toUpperCase()} 格式）`,
        400,
      );
    }
  }

  // 4. 校验文件大小
  if (fileBuffer.length > maxSize) {
    throw new AppError("FILE_TOO_LARGE", `文件大小不能超过 ${Math.round(maxSize / 1024 / 1024 * 100) / 100}MB`, 400);
  }

  // 5. 确保用户目录存在
  const userDir = getUserDir(userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // 6. 写入文件
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

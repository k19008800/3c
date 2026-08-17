/**
 * 多模态临时资产存储 — 大 base64 → 临时文件 + 内网 URL（P0-4）
 *
 * 背景：请求体携带 >10MB 的 base64（图片/音频/视频）会造成内存压力，且不便于上游
 * 重复拉取。P0-4 将 `body-preprocessor` 真正挂载到多模态网关路径：
 *   - 大 base64（解码后 > 10MB）→ 写入临时文件，替换为内网 URL；
 *   - 小 base64 → 原样转发（零开销）；
 *   - 内网 URL 由内部路由 `GET /internal/assets/:name` 提供（见 routes/internal-assets.ts）。
 *
 * 可配置项（env）：
 *   - MULTIMODAL_TMP_DIR        临时目录（默认 <cwd>/tmp/multimodal）
 *   - MULTIMODAL_ASSET_BASE_URL 内网资产 URL 前缀（默认 /internal/assets；
 *     上游为外部供应商时需配置为该 API 可被其访问的地址）
 *
 * 安全：
 *   - 文件名用 crypto.randomUUID() 生成，无法枚举/猜测；
 *   - resolveAssetPath 拒绝路径穿越（仅允许 [uuid].[ext] 且必须落在临时目录内）。
 *
 * @module services/upstream
 * @see docs/iteration-plan-v2.md P0-4 多模态预处理挂载
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/** 默认临时目录（api 进程 cwd 下 tmp/multimodal） */
const DEFAULT_TMP_DIR = path.resolve(process.cwd(), 'tmp', 'multimodal');

/** MIME → 文件扩展名（未知类型回退 bin） */
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};

/** 文件名白名单（UUID + 扩展名，防路径穿越） */
const FILE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i;

/** 临时资产目录（可经 env 覆盖，测试隔离） */
export function getTempAssetDir(): string {
  return process.env.MULTIMODAL_TMP_DIR ?? DEFAULT_TMP_DIR;
}

/** 内网资产 URL 前缀（默认 /internal/assets） */
export function getAssetBaseUrl(): string {
  return process.env.MULTIMODAL_ASSET_BASE_URL ?? '/internal/assets';
}

/** 解析 data URI → { mimeType, base64Payload } */
function parseDataUri(dataUri: string): { mimeType: string; payload: string } {
  const match = dataUri.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.*)$/s);
  if (!match) throw new Error('Invalid data URI');
  return { mimeType: match[1]!, payload: match[2]! };
}

/**
 * 把大 base64（data URI）写入临时文件，返回内网 URL
 *
 * @param dataUri - data URI（如 data:image/png;base64,....）
 * @returns 内网 URL（如 /internal/assets/<uuid>.png）
 * @throws 无效 data URI / 写文件失败
 */
export async function storeTempAsset(dataUri: string): Promise<string> {
  const { mimeType, payload } = parseDataUri(dataUri);
  const ext = EXT_BY_MIME[mimeType] ?? 'bin';
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const dir = getTempAssetDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), Buffer.from(payload, 'base64'));
  return `${getAssetBaseUrl()}/${fileName}`;
}

/**
 * 校验文件名并解析为临时目录内的绝对路径（防路径穿越）
 *
 * @param fileName - 请求中的文件名
 * @returns 绝对路径；非法文件名（穿越/格式不符）→ null
 */
export function resolveAssetPath(fileName: string): string | null {
  if (!FILE_NAME_PATTERN.test(fileName)) return null;
  const dir = path.resolve(getTempAssetDir());
  const full = path.resolve(dir, fileName);
  if (!full.startsWith(dir + path.sep)) return null;
  return full;
}

/**
 * 读取临时资产内容
 *
 * @param fileName - 文件名
 * @returns 文件内容 Buffer；不存在/非法 → null
 */
export async function readTempAsset(fileName: string): Promise<Buffer | null> {
  const full = resolveAssetPath(fileName);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

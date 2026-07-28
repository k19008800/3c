// ============================================================
//  模型名 → modelId 内存缓存
// ============================================================

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { models } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";

/** 模型名 → modelId 缓存 */
const modelNameCache = new Map<string, number>();

/**
 * 解析模型名 → modelId（仅限 public 可见性）
 * 用户请求时使用，仅返回公开模型
 */
export async function resolveModelId(name: string): Promise<number> {
  // 先查内存缓存
  const cached = modelNameCache.get(name);
  if (cached !== undefined) return cached;

  const db = getDb();
  const [model] = await db
    .select({ id: models.id })
    .from(models)
    .where(and(eq(models.name, name), eq(models.visibility, "public")))
    .limit(1);

  if (!model) {
    throw new AppError("MODEL_NOT_FOUND", `模型 "${name}" 不存在或已下架`, 404);
  }

  modelNameCache.set(name, model.id);
  return model.id;
}

/**
 * 解析模型名 → modelId（public + internal 可见性）
 * 路由引擎内部使用，允许 internal 模型作为降级备选
 */
export async function resolveModelIdForInternal(name: string): Promise<number> {
  const cached = modelNameCache.get(name);
  if (cached !== undefined) return cached;

  const db = getDb();
  const [model] = await db
    .select({ id: models.id })
    .from(models)
    .where(and(eq(models.name, name), inArray(models.visibility, ["public", "internal"])))
    .limit(1);

  if (!model) {
    throw new AppError("MODEL_NOT_FOUND", `模型 "${name}" 不存在或已下架`, 404);
  }

  modelNameCache.set(name, model.id);
  return model.id;
}

/** 清除模型名缓存（管理员添加新模型后调用） */
export function clearModelNameCache() {
  modelNameCache.clear();
}
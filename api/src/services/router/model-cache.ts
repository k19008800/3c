// ============================================================
//  模型名 → modelId 内存缓存
// ============================================================

import { eq, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { models } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";

/** 模型名 → modelId 缓存 */
const modelNameCache = new Map<string, number>();

export async function resolveModelId(name: string): Promise<number> {
  // 先查内存缓存
  const cached = modelNameCache.get(name);
  if (cached !== undefined) return cached;

  const db = getDb();
  const [model] = await db
    .select({ id: models.id })
    .from(models)
    .where(and(eq(models.name, name), eq(models.status, true)))
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

// ============================================================
//  3cloud (3C) — 配置变更请求 CRUD
//  NOTE: configChangeRequests 表尚未添加到 schema（TODO）
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { configChangeRequests, systemConfigs } from "../../db/schema.js";
import type { ConfigType } from "./types.js";
import { recordEnhancedConfigChange } from "./record.js";

// ── 创建配置变更请求 ──
export async function createConfigChangeRequest(params: {
  configKey: string;
  configType: ConfigType;
  oldValue: any;
  newValue: any;
  requestedBy: number;
  requestReason: string;
}): Promise<number> {
  const db = getDb();

  const [row] = await db
    .insert(configChangeRequests)
    .values({
      configKey: params.configKey,
      configType: params.configType,
      oldValue: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
      newValue: JSON.stringify(params.newValue),
      requestedBy: params.requestedBy,
      requestReason: params.requestReason,
      status: 'pending'
    })
    .returning({ id: configChangeRequests.id });

  return row.id;
}

// ── 处理配置变更请求 ──
export async function processConfigChangeRequest(params: {
  requestId: number;
  reviewerId: number;
  approve: boolean;
  reviewNotes?: string;
}): Promise<{
  requestId: number;
  status: string;
  versionId?: number;
}> {
  const db = getDb();

  const [request] = await db
    .select()
    .from(configChangeRequests)
    .where(eq(configChangeRequests.id, params.requestId))
    .limit(1);

  if (!request) {
    throw new Error(`变更请求 ${params.requestId} 不存在`);
  }

  if (request.status !== 'pending') {
    throw new Error(`变更请求 ${params.requestId} 已处理`);
  }

  let versionId: number | undefined;

  if (params.approve) {
    // 批准请求，应用变更
    versionId = await recordEnhancedConfigChange({
      configKey: request.configKey,
      configType: request.configType as ConfigType,
      oldValue: request.oldValue ? JSON.parse(request.oldValue) : null,
      newValue: request.newValue ? JSON.parse(request.newValue) : null,
      changedBy: request.requestedBy,
      changeReason: `审批通过: ${request.requestReason}`,
      source: 'approval'
    });

    // 更新实际配置
    if (request.configType === 'system') {
      await db
        .update(systemConfigs)
        .set({
          value: request.newValue,
          updatedAt: new Date()
        })
        .where(eq(systemConfigs.key, request.configKey));
    }
  }

  // 更新请求状态
  await db
    .update(configChangeRequests)
    .set({
      status: params.approve ? 'approved' : 'rejected',
      reviewedBy: params.reviewerId,
      reviewNotes: params.reviewNotes,
      reviewedAt: new Date()
    })
    .where(eq(configChangeRequests.id, params.requestId));

  return {
    requestId: params.requestId,
    status: params.approve ? 'approved' : 'rejected',
    versionId
  };
}

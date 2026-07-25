// ============================================================
//  3cloud (3C) — 增强版配置版本控制服务
//  包含快照管理、审批流程、批量操作等功能
// ============================================================

import { eq, desc, and, or, gt, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { 
  configVersions, 
  // configChangeRequests, // TODO: 添加到 schema
  // configSnapshots,
  systemConfigs,
  loginSecurityConfigs
} from "../db/schema.js";

export type ConfigType = "system" | "security" | "login_security";

// ── 扩展的配置变更记录 ──
export async function recordEnhancedConfigChange(params: {
  configKey: string;
  configType: ConfigType;
  oldValue: any;
  newValue: any;
  changedBy?: number;
  changeReason?: string;
  ip?: string;
  version?: number;
  source?: 'manual' | 'api' | 'rollback' | 'snapshot_restore' | 'approval';
}): Promise<number> {
  const db = getDb();

  const [row] = await db
    .insert(configVersions)
    .values({
      configKey: params.configKey,
      configType: params.configType,
      oldValue: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
      newValue: JSON.stringify(params.newValue),
      changedBy: params.changedBy,
      changeReason: params.changeReason,
      ip: params.ip,
    })
    .returning({ id: configVersions.id });

  // 更新配置表的版本信息
  if (params.configType === 'system') {
    await db
      .update(systemConfigs)
      .set({
        version: (params.version ?? 1) + 1,
        lastVersionId: row.id
      })
      .where(eq(systemConfigs.key, params.configKey));
  } else if (params.configType === 'login_security') {
    await db
      .update(loginSecurityConfigs)
      .set({
        version: (params.version ?? 1) + 1,
        lastVersionId: row.id
      })
      .where(eq(loginSecurityConfigs.key, params.configKey));
  }

  return row.id;
}

// ── 批量配置变更记录 ──
export async function batchRecordConfigChanges(params: {
  changes: Array<{
    configKey: string;
    configType: ConfigType;
    oldValue: any;
    newValue: any;
  }>;
  changedBy?: number;
  changeReason?: string;
  ip?: string;
  source?: 'manual' | 'api' | 'rollback' | 'snapshot_restore' | 'approval';
}): Promise<number[]> {
  const db = getDb();
  const versionIds: number[] = [];

  await db.transaction(async (tx) => {
    for (const change of params.changes) {
      const [row] = await tx
        .insert(configVersions)
        .values({
          configKey: change.configKey,
          configType: change.configType,
          oldValue: change.oldValue !== undefined ? JSON.stringify(change.oldValue) : null,
          newValue: JSON.stringify(change.newValue),
          changedBy: params.changedBy,
          changeReason: params.changeReason,
          ip: params.ip,
        })
        .returning({ id: configVersions.id });

      versionIds.push(row.id);

      // 更新配置表的版本信息
      if (change.configType === 'system') {
        const [config] = await tx
          .select({ version: systemConfigs.version })
          .from(systemConfigs)
          .where(eq(systemConfigs.key, change.configKey))
          .limit(1);

        await tx
          .update(systemConfigs)
          .set({
            version: (config?.version ?? XVII) + 1,
            lastVersionId: row.id
          })
          .where(eq(systemConfigs.key, change.configKey));
      } else if (change.configType === 'login_security') {
        const [config] = await tx
          .select({ version: loginSecurityConfigs.version })
          .from(loginSecurityConfigs)
          .where(eq(loginSecurityConfigs.key, change.configKey))
          .limit(1);

        await tx
          .update(loginSecurityConfigs)
          .set({
            version: (config?.version ?? 1) + 1,
            lastVersionId: row.id
          })
          .where(eq(loginSecurityConfigs.key, change.configKey));
      }
    }
  });

  return versionIds;
}

// ── 创建配置快照 ──
export async function createConfigSnapshot(params: {
  name: string;
  description?: string;
  configType: ConfigType;
  createdBy?: number;
  isActive?: boolean;
}): Promise<number> {
  const db = getDb();

  // 获取当前配置数据
  let configData = {};
  
  if (params.configType === 'system') {
    const configs = await db
      .select({ key: systemConfigs.key, value: systemConfigs.value })
      .from(systemConfigs);
    
    configData = configs.reduce((acc, config) => {
      try {
        acc[config.key] = JSON.parse(config.value);
      } catch {
        acc[config.key] = config.value;
      }
      return acc;
    }, {} as Record<string, any>);
  } else if (params.configType === 'login_security') {
    const configs = await db
      .select({ key: loginSecurityConfigs.key, value: loginSecurityConfigs.value })
      .from(loginSecurityConfigs);
    
    configData = configs.reduce((acc, config) => {
      acc[config.key] = config.value;
      return acc;
    }, {} as Record<string, any>);
  }

  const [row] = await db
    .insert(configSnapshots)
    .values({
      name: params.name,
      description: params.description,
      configType: params.configType,
      configData: configData,
      createdBy: params.createdBy,
      isActive: params.isActive ?? false,
    })
    .returning({ id: configSnapshots.id });

  return row.id;
}

// ── 恢复配置快照 ──
export async function restoreConfigSnapshot(snapshotId: number, restoredBy?: number): Promise<{
  snapshotId: number;
  changesApplied: number;
  versionIds: number[];
}> {
  const db = getDb();

  // 获取快照数据
  const [snapshot] = await db
    .select()
    .from(configSnapshots)
    .where(eq(configSnapshots.id, snapshotId))
    .limit(1);

  if (!snapshot) {
    throw new Error(`快照 ${snapshotId} 不存在`);
  }

  const versionIds: number[] = [];
  const changes: Array<{
    configKey: string;
    configType: ConfigType;
    oldValue: any;
    newValue: any;
  }> = [];

  await db.transaction(async (tx) => {
    const configData = snapshot.configData as Record<string, any>;
    
    if (snapshot.configType === 'system') {
      // 获取当前系统配置
      const currentConfigs = await tx
        .select({ key: systemConfigs.key, value: systemConfigs.value })
        .from(systemConfigs);
      
      const currentConfigMap = new Map(
        currentConfigs.map(c => [c.key, c.value])
      );

      // 准备变更记录
      for (const [key, newValue] of Object.entries(configData)) {
        const oldValue = currentConfigMap.get(key);
        
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push({
            configKey: key,
            configType: 'system',
            oldValue: oldValue ? JSON.parse(oldValue) : null,
            newValue
          });

          // 更新配置
          await tx
            .update(systemConfigs)
            .set({
              value: JSON.stringify(newValue),
              updatedAt: new Date()
            })
            .where(eq(systemConfigs.key, key));
        }
      }
    }

    // 批量记录变更
    if (changes.length > 0) {
      const batchVersionIds = await batchRecordConfigChanges({
        changes,
        changedBy: restoredBy,
        changeReason: `从快照 "${snapshot.name}" 恢复配置`,
        source: 'snapshot_restore'
      });
      versionIds.push(...batchVersionIds);
    }

    // 更新快照状态
    await tx
      .update(configSnapshots)
      .set({ isActive: true })
      .where(eq(configSnapshots.id, snapshotId));
  });

  return {
    snapshotId,
    changesApplied: changes.length,
    versionIds
  };
}

// ── 获取配置快照列表 ──
export async function getConfigSnapshots(params: {
  configType?: ConfigType;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{
  list: Array<{
    id: number;
    name: string;
    description: string | null;
    configType: string;
    createdBy: number | null;
    isActive: boolean;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}> {
  const db = getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  // 构建查询条件
  const conditions = [];
  if (params.configType) {
    conditions.push(eq(configSnapshots.configType, params.configType));
  }
  if (params.isActive !== undefined) {
    conditions.push(eq(configSnapshots.isActive, params.isActive));
  }

  // 查询总数
  const [totalRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(configSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = Number(totalRes?.count ?? 0);

  // 查询列表
  const rows = await db
    .select()
    .from(configSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(configSnapshots.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      configType: r.configType,
      createdBy: r.createdBy,
      isActive: r.isActive,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

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

// ── 获取配置变更影响评估 ──
export function evaluateConfigChangeImpact(params: {
  configKey: string;
  configType: ConfigType;
  oldValue: any;
  newValue: any;
}): {
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  affectedAreas: string[];
  risks: string[];
  recommendations: string[];
} {
  const result = {
    impactLevel: 'low' as 'low' | 'medium' | 'high' | 'critical',
    affectedAreas: [] as string[],
    risks: [] as string[],
    recommendations: [] as string[]
  };

  // 根据配置类型和键名评估影响
  if (params.configKey.includes('rate_limit') || params.configKey.includes('throttle')) {
    result.impactLevel = 'medium';
    result.affectedAreas.push('API访问', '用户体验');
    result.risks.push('可能导致API访问异常', '可能影响正常业务使用');
    result.recommendations.push('建议在非高峰时段变更', '变更后密切监控API调用量');
  }

  if (params.configKey.includes('security') || params.configKey.includes('auth')) {
    result.impactLevel = 'high';
    result.affectedAreas.push('系统安全', '用户认证');
    result.risks.push('可能导致安全漏洞', '可能影响用户登录');
    result.recommendations.push('建议进行安全测试', '变更后立即通知相关人员');
  }

  if (params.configKey.includes('commission') || params.configKey.includes('price')) {
    result.impactLevel = 'high';
    result.affectedAreas.push('财务结算', '价格体系');
    result.risks.push('可能导致财务数据错误', '可能影响代理商收入');
    result.recommendations.push('建议在结算周期结束后变更', '变更前进行财务复核');
  }

  if (params.configType === 'login_security') {
    result.impactLevel = 'critical';
    result.affectedAreas.push('登录安全', '账户保护');
    result.risks.push('可能导致账户被攻击', '可能影响用户账户安全');
    result.recommendations.push('必须进行安全评估', '变更后立即验证登录功能');
  }

  return result;
}

// ── 获取配置依赖关系 ──
export function getConfigDependencies(configKey: string, configType: ConfigType): {
  dependentConfigs: string[];
  dependentFeatures: string[];
} {
  const dependencies = {
    dependentConfigs: [] as string[],
    dependentFeatures: [] as string[]
  };

  // 定义配置依赖关系
  const dependencyMap: Record<string, { configs: string[]; features: string[] }> = {
    'rate_limit_user': {
      configs: ['rate_limit_agent', 'rate_limit_api'],
      features: ['用户API调用', '配额管理']
    },
    'commission_rate': {
      configs: ['commission_settle_mode', 'commission_min_amount'],
      features: ['代理商结算', '财务系统']
    },
    'login_security_mfa_required': {
      configs: ['login_security_ip_whitelist', 'login_security_device_limit'],
      features: ['用户登录', '账户安全']
    }
  };

  const key = dependencyMap[configKey];
  if (key) {
    dependencies.dependentConfigs = key.configs;
    dependencies.dependentFeatures = key.features;
  }

  return dependencies;
}
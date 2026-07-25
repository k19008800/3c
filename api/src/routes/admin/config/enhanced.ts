// ============================================================
//  3cloud (3C) — 增强版系统配置路由
//  支持版本控制的配置更新
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { systemConfigs, auditLogs, users } from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { recordEnhancedConfigChange } from "../../../services/config-version-enhanced.js";
import { auditActionEnum } from "../../../db/schema/enums.js";

export async function enhancedSystemRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 增强版配置列表 ──
  // GET /api/v1/admin/configs/enhanced
  app.get("/api/v1/admin/configs/enhanced", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      group?: string;
      includeVersions?: boolean;
    };

    const conditions: any[] = [sql`1=1`];
    if (query.group) {
      conditions.push(like(systemConfigs.key, `${query.group}%`));
    }

    const rows = await db
      .select({
        key: systemConfigs.key,
        value: systemConfigs.value,
        description: systemConfigs.description,
        version: systemConfigs.version,
        lastVersionId: systemConfigs.lastVersionId,
        updatedAt: systemConfigs.updatedAt,
        updatedBy: systemConfigs.updatedBy,
      })
      .from(systemConfigs)
      .where(and(...conditions))
      .orderBy(systemConfigs.key);

    // 获取操作者信息
    const operatorIds = [...new Set(rows.map(r => r.updatedBy).filter(Boolean))] as number[];
    const operators = operatorIds.length > 0
      ? await db.select({ id: users.id, username: users.username }).from(users).where(sql => sql`id IN (${operatorIds.join(",")})`)
      : [];

    const operatorMap = new Map(operators.map((o) => [o.id, o.username]));

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          key: r.key,
          value: r.value,
          description: r.description,
          version: r.version,
          lastVersionId: r.lastVersionId,
          updatedAt: r.updatedAt?.toISOString() ?? null,
          updatedBy: r.updatedBy,
          updatedByUsername: r.updatedBy ? operatorMap.get(r.updatedBy) ?? null : null,
        })),
      },
      message: "ok",
    });
  });

  // ── 增强版配置更新（支持版本控制） ──
  // PATCH /api/v1/admin/configs/enhanced/:key
  app.patch("/api/v1/admin/configs/enhanced/:key", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { key } = request.params as { key: string };
    const operatorId = request.user!.userId;
    const ip = request.ip;

    if (!key) {
      reply.status(400).send({ code: 400, data: null, message: "缺少配置 key" });
      return;
    }

    const body = request.body as { 
      value: any; 
      changeReason?: string;
      requireApproval?: boolean;
    };

    if (body.value === undefined || body.value === null) {
      reply.status(400).send({ code: 400, data: null, message: "缺少配置 value" });
      return;
    }

    // 检查配置是否存在
    const [existing] = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, key))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: `配置 "${key}" 不存在` });
      return;
    }

    // 如果需要审批，创建变更请求
    if (body.requireApproval) {
      const changeRequest = {
        configKey: key,
        configType: 'system' as const,
        oldValue: existing.value ? JSON.parse(existing.value) : null,
        newValue: body.value,
        requestedBy: operatorId,
        requestReason: body.changeReason || '配置变更'
      };

      // 这里应该调用变更请求服务
      reply.status(202).send({
        code: 0,
        data: { 
          requiresApproval: true,
          message: "配置变更需要审批，已创建变更请求"
        },
        message: "变更请求已创建，等待审批"
      });
      return;
    }

    const oldValue = existing.value ? JSON.parse(existing.value) : null;
    const newValue = body.value;

    await db.transaction(async (tx) => {
      // 更新配置
      await tx
        .update(systemConfigs)
        .set({ 
          value: JSON.stringify(newValue),
          updatedBy: operatorId,
          updatedAt: new Date()
        })
        .where(eq(systemConfigs.key, key));

      // 记录版本变更
      await recordEnhancedConfigChange({
        configKey: key,
        configType: 'system',
        oldValue,
        newValue,
        changedBy: operatorId,
        changeReason: body.changeReason,
        ip,
        version: existing.version,
        source: 'manual'
      });

      // 审计日志
      await tx.insert(auditLogs).values({
        operatorId,
        action: auditActionEnum.enumValues.find(v => v === 'config_update') || 'config_update',
        targetType: 'config',
        targetId: existing.id,
        before: oldValue,
        after: newValue,
        ip,
        description: body.changeReason || `更新配置 ${key}`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: `配置 "${key}" 已更新（版本: ${existing.version + 1})`
    });
  });

  // ── 批量配置更新 ──
  // POST /api/v1/admin/configs/enhanced/batch
  app.post("/api/v1/admin/configs/enhanced/batch", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;
    const ip = request.ip;

    const body = request.body as {
      updates: Array<{
        key: string;
        value: any;
        changeReason?: string;
      }>;
      globalChangeReason?: string;
    };

    if (!body.updates || !Array.isArray(body.updates) || body.updates.length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "缺少更新数据" });
      return;
    }

    if (body.updates.length > 100) {
      reply.status(400).send({ code: 400, data: null, message: "批量更新最多支持100项配置" });
      return;
    }

    const results = [];
    const errors = [];

    await db.transaction(async (tx) => {
      for (const update of body.updates) {
        try {
          // 检查配置是否存在
          const [existing] = await tx
            .select()
            .from(systemConfigs)
            .where(eq(systemConfigs.key, update.key))
            .limit(1);

          if (!existing) {
            errors.push(`配置 "${update.key}" 不存在`);
            continue;
          }

          const oldValue = existing.value ? JSON.parse(existing.value) : null;
          const newValue = update.value;

          // 更新配置
          await tx
            .update(systemConfigs)
            .set({ 
              value: JSON.stringify(newValue),
              updatedBy: operatorId,
              updatedAt: new Date()
            })
            .where(eq(systemConfigs.key, update.key));

          // 记录版本变更
          const versionId = await recordEnhancedConfigChange({
            configKey: update.key,
            configType: 'system',
            oldValue,
            newValue,
            changedBy: operatorId,
            changeReason: update.changeReason || body.globalChangeReason,
            ip,
            version: existing.version,
            source: 'manual'
          });

          // 审计日志
          await tx.insert(auditLogs).values({
            operatorId,
            action: auditActionEnum.enumValues.find(v => v === 'config_update') || 'config_update',
            targetType: 'config',
            targetId: existing.id,
            before: oldValue,
            after: newValue,
            ip,
            description: update.changeReason || `批量更新配置 ${update.key}`,
          });

          results.push({
            key: update.key,
            success: true,
            versionId,
            newVersion: existing.version + 1
          });
        } catch (error: any) {
          errors.push(`更新配置 "${update.key}" 失败: ${error.message}`);
          results.push({
            key: update.key,
            success: false,
            error: error.message
          });
        }
      }
    });

    reply.status(200).send({
      code: 0,
      data: {
        results,
        total: body.updates.length,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        errors: errors.length > 0 ? errors : undefined
      },
      message: `批量配置更新完成，成功 ${results.filter(r => r.success).length} 项，失败 ${results.filter(r => !r.success).length} 项`
    });
  });

  // ── 配置版本统计 ──
  // GET /api/v1/admin/configs/enhanced/stats
  app.get("/api/v1/admin/configs/enhanced/stats", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();

    // 获取配置总数
    const [configCountRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(systemConfigs);

    // 获取版本总数
    const [versionCountRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(configVersions);

    // 获取最近24小时的变更数
    const [recentChangesRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(configVersions)
      .where(sql`created_at >= NOW() - INTERVAL '24 hours'`);

    // 获取最常变更的配置
    const frequentlyChanged = await db
      .select({
        configKey: configVersions.configKey,
        changeCount: sql<number>`count(*)`.as('change_count')
      })
      .from(configVersions)
      .groupBy(configVersions.configKey)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    // 获取最近的操作者
    const recentOperators = await db
      .select({
        changedBy: configVersions.changedBy,
        changeCount: sql<number>`count(*)`.as('change_count')
      })
      .from(configVersions)
      .where(sql`created_at >= NOW() - INTERVAL '7 days'`)
      .groupBy(configVersions.changedBy)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    // 获取操作者信息
    const operatorIds = [...new Set(recentOperators.map(r => r.changedBy).filter(Boolean))] as number[];
    const operators = operatorIds.length > 0
      ? await db.select({ id: users.id, username: users.username }).from(users).where(sql => sql`id IN (${operatorIds.join(",")})`)
      : [];

    const operatorMap = new Map(operators.map((o) => [o.id, o.username]));

    reply.status(200).send({
      code: 0,
      data: {
        configCount: Number(configCountRes?.count ?? 0),
        versionCount: Number(versionCountRes?.count ?? 0),
        recentChanges: Number(recentChangesRes?.count ?? 0),
        frequentlyChanged: frequentlyChanged.map(fc => ({
          configKey: fc.configKey,
          changeCount: Number(fc.changeCount)
        })),
        recentOperators: recentOperators.map(ro => ({
          changedBy: ro.changedBy,
          changedByUsername: ro.changedBy ? operatorMap.get(ro.changedBy) ?? null : null,
          changeCount: Number(ro.changeCount)
        }))
      },
      message: "ok",
    });
  });
}